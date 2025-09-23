import {
  Context,
  AstCodeSplitter,
  AzureOpenAIEmbedding,
  AzureAISearchVectorDatabase,
  getGitRepoName,
} from "@suoshengzhang/claude-context-core";
import * as path from "path";
import { getAISearchKey } from "@suoshengzhang/claude-context-core";
import axios from "axios";
import { AzureKeyCredential } from "@azure/search-documents";
import { SearchIndexClient } from "@azure/search-documents";

const AZURE_ENDPOINT = "https://codeagentsearch01.search.windows.net";
const AZURE_API_KEY = "";

/**
 * Generate a snapshot file for the given codebase directory
 * @param rootDir Absolute path to codebase directory
 * @param ignorePatterns Optional array of glob patterns to ignore
 * @returns Promise that resolves when snapshot is generated
 */
async function generateSnapshot(
  rootDir: string,
  ignorePatterns: string[] = [],
  supportedExtensions: string[] = []
): Promise<void> {
  try {
    console.log(`Generating snapshot for codebase: ${rootDir}`);

    // Create synchronizer instance with provided ignore patterns
    const { FileSynchronizer } = await import(
      "@suoshengzhang/claude-context-core"
    );
    const synchronizer = new FileSynchronizer(
      rootDir,
      ignorePatterns,
      supportedExtensions
    );

    // Initialize will generate initial hashes and save snapshot
    await synchronizer.initialize();

    console.log("✅ Snapshot generated successfully");
  } catch (error: any) {
    console.error("Failed to generate snapshot:", error.message);
    throw error;
  }
}

async function indexCodePathForRepo(
  codebasePath: string,
  ignorePatterns: string[],
  supportedExtensions: string[],
  isHybrid: boolean
) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  let timestamp = `${year}${month}${day}${hours}${minutes}`;
  const gitRepoName = getGitRepoName(codebasePath);

  let collectionBaseName = `hybrid_code_chunks_${gitRepoName.repoName}`;
  collectionBaseName = collectionBaseName.toLowerCase();

  let aliasName = collectionBaseName.replace(/_/g, "-");
  const collectionName = `${collectionBaseName}_${timestamp}`;

  const vectorDatabase = new AzureAISearchVectorDatabase({
    endpoint: AZURE_ENDPOINT,
    apiKey: AZURE_API_KEY,
  });

  // "https://cppcodeanalyzer-efaxdbfzc2auexad.eastasia-01.azurewebsites.net/"
  let embedding = new AzureOpenAIEmbedding({
    codeAgentEmbEndpoint: "http://localhost:8000",
  });

  var codeSplitter = new AstCodeSplitter(20000, 300);

  let context = new Context({
    embedding,
    vectorDatabase,
    codeSplitter,
    supportedExtensions: supportedExtensions,
    ignorePatterns: ignorePatterns,
    isHybrid: isHybrid,
    customCollectionName: collectionName,
  });

  const hasExistingIndex = await context.hasIndex(codebasePath);
  if (hasExistingIndex) {
    console.log("🗑️  Existing index found, clearing it first...");
    await context.clearIndex(codebasePath);
  }

  let lastLogTime = 0;
  // // Index with progress tracking
  const indexStats = await context.indexCodebase(codebasePath, (progress) => {
    // Track last log time
    const now = Date.now();
    const LOG_INTERVAL = 1 * 60 * 1000; // 3 minutes in milliseconds

    if (now - lastLogTime >= LOG_INTERVAL) {
      console.log(
        `Indexing progress: ${progress.phase} - ${progress.percentage}%`
      );
      lastLogTime = now;
    }
  });

  await generateSnapshot(
    codebasePath,
    context.getIgnorePatterns(),
    supportedExtensions
  );
  console.log("✅ Snapshot generated successfully");

  await switchAzureAISearchAlias(aliasName, collectionName);
  console.log("✅ Switched alias finished");
}

async function switchAzureAISearchAlias(
  aliasName: string,
  newIndexName: string
): Promise<void> {
  console.log(
    `🔄 Switching alias '${aliasName}' to point to index '${newIndexName}'...`
  );

  try {
    const getParams = {
      method: "GET",
      url: `${AZURE_ENDPOINT}/aliases('${aliasName}')`,
      params: { "api-version": "2025-08-01-preview" },
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY,
      },
    };

    const getResponse = await axios.request(getParams);
    let oldIndexName = "";
    if (getResponse.data.indexes.length > 0) {
      oldIndexName = getResponse.data.indexes[0];
    }

    console.log(`🔍 Old index name: ${oldIndexName}`);

    const httpParams = {
      method: "PUT",
      url: `${AZURE_ENDPOINT}/aliases('${aliasName}')`,
      params: { "api-version": "2025-08-01-preview" },
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY,
      },
      data: {
        name: aliasName,
        indexes: [newIndexName],
      },
    };

    const response = await axios.request(httpParams);
    if (response.status > 200 && response.status < 300) {
      console.log(
        `✅ Switched alias '${aliasName}' to point to index '${newIndexName}'`
      );

      const credential = new AzureKeyCredential(AZURE_API_KEY);
      const indexClient = new SearchIndexClient(AZURE_ENDPOINT, credential);

      console.log(
        `🔍 Sleep 10 seconds to delete old index '${oldIndexName}'...`
      );
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Sleep for 10 seconds
      await indexClient.deleteIndex(oldIndexName);
      console.log(`✅ Dropped Azure AI Search index: ${oldIndexName}`);
    } else {
      console.error(`❌ Failed to switch alias:`, response.status);
    }
  } catch (error) {
    console.error(`❌ Failed to switch alias:`, error);
    throw error;
  }
}

async function main() {
  console.log("🚀 Context Real Usage Example");
  console.log("===============================");
  let startTime = Date.now();

  const repoConfig = [
    {
      repoPath: "D:/src2/AdsSnR",
      // repoPath: "D:/src/simple_repo",
      ignorePatterns: [
        "packages/",
        "*.md",
        "*.txt",
        "*.json",
        "*.yml",
        "*.yaml",
        "*.xml",
        "*.config",
        "docs/",
        "third_party/",
        "3rdparty/",
        "external/",
        "build/",
        "out/",
        "bin/",
        "obj/",
      ],
      supportedExtensions: [".cs", ".js", ".py", ".cpp", ".h"],
    },
    // {
    //     repoPath: "D:/src2/AdsSnR_IdHash",
    //     ignorePatterns: [
    //         "packages/",
    //     ]
    // },
    // {
    //     repoPath: "D:/src2/AdsInfra_DataServices",
    //     ignorePatterns: [
    //         "packages/",
    //     ]
    // }
  ];

  try {
    for (const repo of repoConfig) {
      await indexCodePathForRepo(
        repo.repoPath,
        repo.ignorePatterns,
        repo.supportedExtensions,
        true
      );
    }
    let endTime = Date.now();
    console.log(`Time taken: ${endTime - startTime}ms`);
    console.log("\n🎉 Example completed successfully!");
  } catch (error) {
    console.error("❌ Error occurred:", error);
    process.exit(1);
  }
}

// Run main program
if (require.main === module) {
  main().catch(console.error);
}

export { main };
