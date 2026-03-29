import type { IExecuteFunctions, IPollFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { GraphQLClient } from 'graphql-request';
import { getSdk } from './generated/graphql';

type ExecutionContext = IExecuteFunctions | IPollFunctions;

export class NexarClient {
	private graphqlClient: GraphQLClient;
	private sdk: ReturnType<typeof getSdk>;
	private context: ExecutionContext;
	private credentialType: string;

	private static readonly GRAPHQL_ENDPOINT = 'https://api.nexar.com/graphql';

	/**
	 * Create a NexarClient using n8n's OAuth2 credential system
	 * @param context - n8n execution context (IExecuteFunctions or IPollFunctions)
	 * @param credentialType - The credential type name (e.g., 'altium365NexarApi')
	 */
	constructor(context: ExecutionContext, credentialType: string = 'altium365NexarApi') {
		this.context = context;
		this.credentialType = credentialType;

		// Create a custom GraphQL client that uses n8n's OAuth2 request helper
		this.graphqlClient = new GraphQLClient(NexarClient.GRAPHQL_ENDPOINT, {
			headers: {
				'User-Agent': 'n8n-nodes-altium365/0.2.0',
			},
			// Override the request method to use n8n's OAuth2 helper
			fetch: async (url: string | URL | Request, options?: Record<string, any>) => {
				const urlString = typeof url === 'string' ? url : url.toString();
				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: urlString,
					headers: options?.headers as Record<string, string>,
					body: options?.body as string,
					json: false, // Body is already JSON stringified by graphql-request
					returnFullResponse: true, // Get status code and headers
				};

				try {
					const response = await this.context.helpers.requestWithAuthentication.call(
						this.context,
						this.credentialType,
						requestOptions,
					);

					// n8n returns { body, headers, statusCode, statusMessage }
					const statusCode = (response as any).statusCode || 200;
					const body = (response as any).body || response;

					// Return a Response-like object for graphql-request
					return {
						ok: statusCode >= 200 && statusCode < 300,
						status: statusCode,
						statusText: (response as any).statusMessage || 'OK',
						text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
						json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
						headers: new Headers((response as any).headers || {}),
					} as Response;
				} catch (error) {
					// Handle authentication errors or network errors
					const errorMessage = error instanceof Error ? error.message : String(error);

					// Return error response that graphql-request can handle
					return {
						ok: false,
						status: 502,
						statusText: 'Bad Gateway',
						text: async () => JSON.stringify({ error: errorMessage }),
						json: async () => ({ error: errorMessage }),
						headers: new Headers(),
					} as Response;
				}
			},
		});

		this.sdk = getSdk(this.graphqlClient);
	}

	/**
	 * Get the fully typed GraphQL SDK
	 */
	getSdk() {
		return this.sdk;
	}

	/**
	 * Execute a raw GraphQL query (for custom queries not in the SDK)
	 */
	query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		return this.graphqlClient.request<T>(query, variables);
	}
}
