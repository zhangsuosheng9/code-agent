import {
  AzureAISearchVectorDatabase,
  AzureOpenAIEmbedding,
  VectorDocument,
  AstCodeSplitter,
  LangChainCodeSplitter,
} from "@suoshengzhang/claude-context-core";
import axios from "axios";
import * as fs from "fs";

async function main() {
  console.log("🚀 Starting Split Test");
  console.log("=====================================");

  try {
    var codeSplitter = new AstCodeSplitter(20000, 300);
    //const filePath = "Q:\\src\\AdsSnR\\private\\Ads.QueeneAggregator.Product\\QueeneAggregator\\src\\QueeneClient.cpp";
    //const filePath = "Q:\\src\\AdsSnR\\private\\Ads.PA.OnlineOfferSelection.Product\\src\\OfferSelectionPartition\\Host\\Workflows\\workflow_NonNativeSelectOffers.cpp";
    //const filePath = "Q:\\src\\AdsSnR\\private\\Ads.PA.JennyA.Product\\src\\JennyA\\JennyAServiceImpl.cpp";
    const filePath = "Q:\\src\\AdsSnr\\private\\Ads.Caique.Product\\UnitTests\\DynamicRankingApplicationTests.cpp";
    const content = await fs.promises.readFile(filePath, "utf-8");
    const language = "cpp";
    const chunks = await codeSplitter.split(content, language, filePath);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n--- Chunk ${i} ---`);
      //console.log(`Content:\n${chunk.content}`);
      console.log(`Metadata:`, chunk.metadata);
    }

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

export { main as testSplitChunk };
