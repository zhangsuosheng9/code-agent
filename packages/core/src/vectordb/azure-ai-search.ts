import {
  VectorDocument,
  SearchOptions,
  VectorSearchResult,
  VectorDatabase,
  HybridSearchRequest,
  HybridSearchOptions,
  HybridSearchResult,
  COLLECTION_LIMIT_MESSAGE,
} from "./types";
import {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
  SearchIndex,
  SearchField,
  VectorSearch,
  VectorSearchAlgorithmConfiguration,
  VectorSearchProfile,
  SemanticSearch,
  SemanticConfiguration,
  SearchOptions as AzureSearchOptions,
  VectorQuery,
} from "@azure/search-documents";

export interface AzureAISearchConfig {
  endpoint: string;
  apiKey: string;
  apiVersion?: string;
}

/**
 * Azure AI Search Vector Database implementation using TypeScript SDK
 * This implementation provides vector search capabilities using Azure AI Search service.
 */
export class AzureAISearchVectorDatabase implements VectorDatabase {
  protected config: AzureAISearchConfig;
  private indexClient: SearchIndexClient;
  protected initializationPromise: Promise<void>;

  constructor(config: AzureAISearchConfig) {
    this.config = {
      apiVersion: "2024-07-01", // Stable version with vector search support
      ...config,
    };

    // Validate required configuration
    if (!this.config.endpoint || !this.config.apiKey) {
      throw new Error("Azure AI Search endpoint and apiKey are required");
    }

    // Ensure endpoint has proper format
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    const finalEndpoint = endpoint.startsWith("https://")
      ? endpoint
      : `https://${endpoint}`;

    // Initialize Azure SDK clients
    const credential = new AzureKeyCredential(this.config.apiKey);
    this.indexClient = new SearchIndexClient(finalEndpoint, credential);

    // Start initialization asynchronously without waiting
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log(`🔌 Connecting to Azure AI Search at: ${this.config.endpoint}`);
    // Azure AI Search SDK doesn't require explicit initialization
    // The connection is validated on first API call
  }

  /**
   * Ensure initialization is complete before method execution
   */
  protected async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  /**
   * Get SearchClient for a specific index
   */
  private getSearchClient(indexName: string): SearchClient<any> {
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    const finalEndpoint = endpoint.startsWith("https://")
      ? endpoint
      : `https://${endpoint}`;
    const credential = new AzureKeyCredential(this.config.apiKey);
    return new SearchClient(finalEndpoint, indexName, credential);
  }

  async createCollection(
    collectionName: string,
    dimension: number,
    description?: string
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      let lowerCaseCollectionName = collectionName.toLowerCase();
      // Create index schema for Azure AI Search using SDK types
      const indexSchema: SearchIndex = {
        name: lowerCaseCollectionName,
        fields: [
          {
            name: "id",
            type: "Edm.String",
            key: true,
            searchable: false,
            filterable: true,
            sortable: false,
            facetable: false,
            retrievable: true,
          } as SearchField,
          {
            name: "content",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            sortable: false,
            facetable: false,
            retrievable: true,
            analyzer: "standard.lucene",
          } as SearchField,
          {
            name: "contentVector",
            type: "Collection(Edm.Single)",
            searchable: true,
            filterable: false,
            sortable: false,
            facetable: false,
            retrievable: true,
            vectorSearchDimensions: dimension,
            vectorSearchProfileName: "default-vector-profile",
          } as any,
          {
            name: "relativePath",
            type: "Edm.String",
            searchable: false,
            filterable: true,
            sortable: false,
            facetable: false,
            retrievable: true,
          } as SearchField,
          {
            name: "startLine",
            type: "Edm.Int32",
            searchable: false,
            filterable: true,
            sortable: true,
            facetable: false,
            retrievable: true,
          } as SearchField,
          {
            name: "endLine",
            type: "Edm.Int32",
            searchable: false,
            filterable: true,
            sortable: true,
            facetable: false,
            retrievable: true,
          } as SearchField,
          {
            name: "fileExtension",
            type: "Edm.String",
            searchable: false,
            filterable: true,
            sortable: false,
            facetable: true,
            retrievable: true,
          } as SearchField,
          {
            name: "metadata",
            type: "Edm.String",
            searchable: false,
            filterable: false,
            sortable: false,
            facetable: false,
            retrievable: true,
          } as SearchField,
        ],
        vectorSearch: {
          algorithms: [
            {
              name: "default-vector-algorithm",
              kind: "hnsw",
              parameters: {
                m: 4,
                efConstruction: 400,
                efSearch: 500,
                metric: "cosine",
              },
            } as VectorSearchAlgorithmConfiguration,
          ],
          profiles: [
            {
              name: "default-vector-profile",
              algorithmConfigurationName: "default-vector-algorithm",
            } as any,
          ],
        } as VectorSearch,
      };

      console.log(
        "🔍 Creating index with schema:",
        JSON.stringify(indexSchema, null, 2)
      );
      await this.indexClient.createOrUpdateIndex(indexSchema);
      console.log(`✅ Created Azure AI Search index: ${collectionName}`);
    } catch (error: any) {
      // Check for collection limit errors (Azure AI Search has service limits)
      const errorMessage = error.message || error.toString() || "";
      if (/limit|quota|exceeded/i.test(errorMessage)) {
        throw COLLECTION_LIMIT_MESSAGE;
      }
      console.error(
        `❌ Failed to create collection '${collectionName}':`,
        error
      );
      throw error;
    }
  }

  async createHybridCollection(
    collectionName: string,
    dimension: number,
    description?: string
  ): Promise<void> {
    await this.createCollection(collectionName, dimension, description);
  }

  async dropCollection(collectionName: string): Promise<void> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    try {
      await this.indexClient.deleteIndex(lowerCaseCollectionName);
      console.log(
        `✅ Dropped Azure AI Search index: ${lowerCaseCollectionName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to drop collection '${lowerCaseCollectionName}':`,
        error
      );
      throw error;
    }
  }

  async hasCollection(collectionName: string): Promise<boolean> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    try {
      await this.indexClient.getIndex(lowerCaseCollectionName);
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      console.error(
        `❌ Failed to check collection '${lowerCaseCollectionName}' existence:`,
        error
      );
      throw error;
    }
  }

  async listCollections(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const indexes = this.indexClient.listIndexes();
      const indexNames: string[] = [];
      for await (const index of indexes) {
        indexNames.push(index.name);
      }
      return indexNames;
    } catch (error) {
      console.error(`❌ Failed to list collections:`, error);
      throw error;
    }
  }

  async insert(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<void> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    try {
      // Transform VectorDocument array to Azure AI Search document format
      const azureDocuments: any[] = documents.map((doc) => ({
        id: doc.id,
        content: doc.content,
        contentVector: doc.vector,
        relativePath: doc.relativePath,
        startLine: doc.startLine,
        endLine: doc.endLine,
        fileExtension: doc.fileExtension,
        metadata: JSON.stringify(doc.metadata),
      }));

      const searchClient = this.getSearchClient(lowerCaseCollectionName);
      await searchClient.uploadDocuments(azureDocuments);
      console.log(
        `✅ Inserted ${documents.length} documents into index: ${lowerCaseCollectionName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to insert documents into collection '${lowerCaseCollectionName}':`,
        error
      );
      throw error;
    }
  }

  async insertHybrid(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<void> {
    await this.insert(collectionName, documents);
  }

  async search(
    collectionName: string,
    queryVector: number[],
    options?: SearchOptions
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    const topK = options?.topK || 10;

    try {
      let searchOptions: any = {};
      if (options?.type === "vector") {
        searchOptions = {
          count: true,
          // searchFields: ["content"],
          vectorQueries: [
            {
              kind: "vector",
              vector: queryVector,
              k: topK,
              fields: "contentVector",
            },
          ],
          select: [
            "id",
            "content",
            "relativePath",
            "startLine",
            "endLine",
            "fileExtension",
            "metadata",
          ],
          top: topK,
        };
      } else if (options?.type === "text") {
        searchOptions = {
          count: true,
          queryType: "simple",
          searchMode: "all",
          search: options?.queryText || "",
          searchFields: ["content"],
          select: [
            "id",
            "content",
            "relativePath",
            "startLine",
            "endLine",
            "fileExtension",
            "metadata",
          ],
          top: topK,
        };
      } else {
        // TODO: Implement hybrid search
      }

      // Build search options for Azure AI Search SDK

      // Apply filter if provided
      if (options?.filterExpr && options.filterExpr.trim().length > 0) {
        searchOptions.filter = options.filterExpr;
      }

      const searchClient = this.getSearchClient(lowerCaseCollectionName);
      const searchResults = await searchClient.search(
        options?.queryText || "",
        searchOptions
      );

      // Transform response to VectorSearchResult format
      const results: VectorSearchResult[] = [];
      for await (const result of searchResults.results) {
        // Parse metadata from JSON string
        let metadata = {};
        try {
          metadata = JSON.parse((result.document.metadata as string) || "{}");
        } catch (error) {
          console.warn(
            `Failed to parse metadata for item ${result.document.id}:`,
            error
          );
          metadata = {};
        }

        results.push({
          document: {
            id: result.document.id?.toString() || "",
            vector: queryVector, // Vector not returned in search results
            content: (result.document.content as string) || "",
            relativePath: (result.document.relativePath as string) || "",
            startLine: (result.document.startLine as number) || 0,
            endLine: (result.document.endLine as number) || 0,
            fileExtension: (result.document.fileExtension as string) || "",
            metadata: metadata,
          },
          score: result.score || 0,
        });
      }

      return results;
    } catch (error) {
      console.error(
        `❌ Failed to search in collection '${lowerCaseCollectionName}':`,
        error
      );
      throw error;
    }
  }

  async hybridSearch(
    collectionName: string,
    searchRequests: HybridSearchRequest[],
    options?: HybridSearchOptions
  ): Promise<HybridSearchResult[]> {
    throw new Error("Hybrid search is not supported for Azure AI Search");
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    try {
      // Azure AI Search SDK supports batch delete operations
      const deleteDocuments: any[] = ids.map((id) => ({
        id: id,
        "@search.action": "delete",
      }));

      const searchClient = this.getSearchClient(lowerCaseCollectionName);
      await searchClient.uploadDocuments(deleteDocuments);
      console.log(
        `✅ Deleted ${ids.length} documents from index: ${lowerCaseCollectionName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to delete documents from collection '${lowerCaseCollectionName}':`,
        error
      );
      throw error;
    }
  }

  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number
  ): Promise<Record<string, any>[]> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    try {
      const searchOptions: any = {
        filter: filter,
        select: outputFields,
        top: limit || 16384,
      };

      const searchClient = this.getSearchClient(lowerCaseCollectionName);
      const searchResults = await searchClient.search("", searchOptions);

      const results: Record<string, any>[] = [];
      for await (const result of searchResults.results) {
        results.push(result.document);
      }

      return results;
    } catch (error) {
      console.error(
        `❌ Failed to query collection '${lowerCaseCollectionName}':`,
        error
      );
      throw error;
    }
  }

  async listFilePaths(
    collectionName: string,
    batchSize: number
  ): Promise<Set<string>> {
    await this.ensureInitialized();
    let lowerCaseCollectionName = collectionName.toLowerCase();
    try {
      const filePaths = new Set<string>();
      let skip = 0;

      while (true) {
        const searchOptions: any = {
          select: ["relativePath"],
          top: batchSize,
          skip: skip,
        };

        const searchClient = this.getSearchClient(lowerCaseCollectionName);
        const searchResults = await searchClient.search("", searchOptions);

        const results: any[] = [];
        for await (const result of searchResults.results) {
          results.push(result.document);
        }

        if (results.length === 0) {
          break;
        }

        results.forEach((result: any) => {
          if (result.relativePath) {
            filePaths.add(result.relativePath);
          }
        });

        skip += batchSize;

        // If we got fewer results than batch size, we've reached the end
        if (results.length < batchSize) {
          break;
        }
      }

      return filePaths;
    } catch (error) {
      console.error(
        `❌ Failed to list file paths from collection '${collectionName}':`,
        error
      );
      throw error;
    }
  }

  /**
   * Check collection limit
   * Returns true if collection can be created, false if limit exceeded
   */
  async checkCollectionLimit(): Promise<boolean> {
    try {
      // Azure AI Search SDK doesn't provide direct service statistics access
      // We can check by attempting to list indexes and counting them
      const indexes = this.indexClient.listIndexes();
      let indexCount = 0;

      for await (const index of indexes) {
        indexCount++;
        // Azure AI Search typically has limits around 50-200 indexes depending on tier
        if (indexCount >= 50) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn("⚠️  Failed to check collection limit - returning true");
      return true;
    }
  }
}
