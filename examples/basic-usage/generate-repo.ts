import {
  Context,
  AstCodeSplitter,
  LangChainCodeSplitter,
  ChromaVectorDatabase,
  AzureOpenAIEmbedding,
  AzureAISearchVectorDatabase,
} from "@suoshengzhang/claude-context-core";
import * as path from "path";

// Try to load .env file
try {
  require("dotenv").config();
} catch (error) {
  // dotenv is not required, skip if not installed
}

/**
 * Generate a snapshot file for the given codebase directory
 * @param rootDir Absolute path to codebase directory
 * @param ignorePatterns Optional array of glob patterns to ignore
 * @returns Promise that resolves when snapshot is generated
 */
async function generateSnapshot(
  rootDir: string,
  ignorePatterns: string[] = []
): Promise<void> {
  try {
    console.log(`Generating snapshot for codebase: ${rootDir}`);

    // Create synchronizer instance with provided ignore patterns
    const { FileSynchronizer } = await import(
      "@suoshengzhang/claude-context-core"
    );
    const synchronizer = new FileSynchronizer(rootDir, ignorePatterns);

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
  isHybrid: boolean
) {
  // let vectorDatabase = new ChromaVectorDatabase({
  //   host: host,
  //   port: 19082,
  // });

  const vectorDatabase = new AzureAISearchVectorDatabase({
    endpoint: "",
    apiKey: "",
  });

  // "https://cppcodeanalyzer-efaxdbfzc2auexad.eastasia-01.azurewebsites.net/"
  let embedding = new AzureOpenAIEmbedding({
    codeAgentEmbEndpoint: "",
  });

  var codeSplitter = new AstCodeSplitter(20000, 300);

  let context = new Context({
    embedding,
    vectorDatabase,
    codeSplitter,
    supportedExtensions: [".cs", ".js", ".py", ".cpp", ".h"],
    ignorePatterns: ignorePatterns,
    isHybrid: isHybrid,
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

  await generateSnapshot(codebasePath, context.getIgnorePatterns());
  console.log("✅ Snapshot generated successfully");
}

async function main() {
  console.log("🚀 Context Real Usage Example");
  console.log("===============================");
  let startTime = Date.now();

  const repoConfig = [
    {
      repoPath: "Q:/src/AdsSnr",
      // repoPath: "D:/src2/AdsSnR",
      ignorePatterns: ["packages/", "*.md", "*.txt", "*.json", "*.yml", "*.yaml", "*.xml", "*.config", "docs/", "third_party/", "3rdparty/", "external/", "build/", "out/", "bin/", "obj/"],
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
      await indexCodePathForRepo(repo.repoPath, repo.ignorePatterns, true);
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
