import {
  AzureAISearchVectorDatabase,
  AzureOpenAIEmbedding,
  VectorDocument,
} from "@suoshengzhang/claude-context-core";
import axios from "axios";

// Configuration
const COLLECTION_NAME = "test_azure_search_collection";
const AZURE_ENDPOINT = "";
const AZURE_API_KEY = "";
const DENSE_VECTOR_SIZE = 3072; // OpenAI text-embedding-3-small dimension

// Types
interface DenseEmbeddingResponse {
  embedding: number[];
}

interface TestDocument {
  id: string;
  text: string;
  dense_embedding: number[];
  relativePath: string;
  startLine: number;
  endLine: number;
  fileExtension: string;
}

// Helper function to generate embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  // Return a random embedding array of DENSE_VECTOR_SIZE dimensions
  var embeddingSvc = new AzureOpenAIEmbedding({
    codeAgentEmbEndpoint:
      "https://cppcodeanalyzer-efaxdbfzc2auexad.eastasia-01.azurewebsites.net/",
  });
  const embedding = await embeddingSvc.embed(text);
  return embedding.vector;
}

// Sample test documents
const testDocuments: TestDocument[] = [
  {
    id: "doc1",
    text: "This is a TypeScript function that handles user authentication and login.",
    dense_embedding: [], // Will be populated
    relativePath: "src/auth/login.ts",
    startLine: 1,
    endLine: 50,
    fileExtension: ".ts",
  },
  {
    id: "doc2",
    text: "Python class for database connection and query execution with error handling.",
    dense_embedding: [], // Will be populated
    relativePath: "src/database/connection.py",
    startLine: 1,
    endLine: 75,
    fileExtension: ".py",
  },
  {
    id: "doc3",
    text: "JavaScript utility functions for data validation and form processing.",
    dense_embedding: [], // Will be populated
    relativePath: "src/utils/validation.js",
    startLine: 1,
    endLine: 30,
    fileExtension: ".js",
  },
];

async function main() {
  console.log("🚀 Starting Azure AI Search Test");
  console.log("=====================================");

  // Initialize Azure AI Search client
  const azureClient = new AzureAISearchVectorDatabase({
    endpoint: AZURE_ENDPOINT,
    apiKey: AZURE_API_KEY,
  });

  try {
    // Step 1: Generate embeddings for test documents
    console.log("\n📝 Step 1: Generating embeddings for test documents...");
    for (const doc of testDocuments) {
      doc.dense_embedding = await generateEmbedding(doc.text);
      console.log(
        `✅ Generated embedding for ${doc.id} (${doc.dense_embedding.length} dimensions)`
      );
    }

    // Step 2: Create collection
    console.log("\n🏗️  Step 2: Creating collection...");
    try {
      await azureClient.createCollection(
        COLLECTION_NAME,
        DENSE_VECTOR_SIZE,
        "Test collection for Azure AI Search"
      );
      console.log(`✅ Collection '${COLLECTION_NAME}' created successfully`);
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        console.log(
          `⚠️  Collection '${COLLECTION_NAME}' already exists, continuing...`
        );
      } else {
        throw error;
      }
    }

    // Step 3: Insert records
    console.log("\n📥 Step 3: Inserting records...");
    const vectorDocuments: VectorDocument[] = testDocuments.map((doc) => ({
      id: doc.id,
      vector: doc.dense_embedding,
      content: doc.text,
      relativePath: doc.relativePath,
      startLine: doc.startLine,
      endLine: doc.endLine,
      fileExtension: doc.fileExtension,
      metadata: {
        source: "test",
        created: new Date().toISOString(),
        type: "code_snippet",
      },
    }));

    await azureClient.insert(COLLECTION_NAME, vectorDocuments);
    console.log(`✅ Inserted ${vectorDocuments.length} documents successfully`);

    // Step 4: Search for records
    console.log("\n🔍 Step 4: Searching for records...");
    const queryText = "what is queeneaggregator";
    const queryEmbedding = await generateEmbedding(queryText);

    const searchResults = await azureClient.search(
      COLLECTION_NAME,
      queryEmbedding,
      {
        topK: 30,
        queryText: queryText,
        type: "vector",
      }
    );

    console.log(
      `✅ Found ${searchResults.length} vector results for query: "${queryText}"`
    );
    searchResults.forEach((result, index) => {
      console.log(
        `  ${index + 1}. ${
          result.document.relativePath
        } (score: ${result.score.toFixed(4)}), line: ${
          result.document.startLine
        } - ${result.document.endLine}`
      );
      console.log(
        `     Content: ${result.document.content.substring(0, 100)}...`
      );
    });

    // Step 5: Delete record by relativePath
    console.log("\n🗑️  Step 5: Deleting record by relativePath...");

    // First, query to find documents with specific relativePath
    const documentsToDelete = await azureClient.query(
      COLLECTION_NAME,
      `relativePath eq 'src/auth/login.ts'`,
      ["id"],
      10
    );

    if (documentsToDelete.length > 0) {
      const idsToDelete = documentsToDelete.map((doc) => doc.id as string);
      await azureClient.delete(COLLECTION_NAME, idsToDelete);
      console.log(
        `✅ Deleted ${idsToDelete.length} document(s) with relativePath 'src/auth/login.ts'`
      );
    } else {
      console.log(
        "⚠️  No documents found with relativePath 'src/auth/login.ts'"
      );
    }

    // Step 6: Verify deletion by searching again
    console.log("\n🔍 Step 6: Verifying deletion...");
    const remainingResults = await azureClient.search(
      COLLECTION_NAME,
      queryEmbedding,
      {
        topK: 5,
      }
    );

    console.log(
      `✅ Found ${remainingResults.length} remaining documents after deletion`
    );
    remainingResults.forEach((result, index) => {
      console.log(
        `  ${index + 1}. ${
          result.document.relativePath
        } (score: ${result.score.toFixed(4)})`
      );
    });

    // Step 7: List file paths
    console.log("\n📋 Step 7: Listing file paths...");
    const filePaths = await azureClient.listFilePaths(COLLECTION_NAME, 100);
    console.log(`✅ Found ${filePaths.size} unique file paths:`);
    filePaths.forEach((path) => {
      console.log(`  - ${path}`);
    });

    // Step 8: Delete collection
    console.log("\n🗑️  Step 8: Deleting collection...");
    await azureClient.dropCollection(COLLECTION_NAME);
    console.log(`✅ Collection '${COLLECTION_NAME}' deleted successfully`);

    console.log("\n🎉 All tests completed successfully!");
    console.log("=====================================");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}

export { main as testAzureSearch };
