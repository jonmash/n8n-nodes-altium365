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
					json: false, // Body is already JSON string
				};

				const response = await this.context.helpers.requestWithAuthentication.call(
					this.context,
					this.credentialType,
					requestOptions,
				);

				// Return a Response-like object for graphql-request
				return {
					ok: true,
					status: 200,
					text: async () => (typeof response === 'string' ? response : JSON.stringify(response)),
					json: async () => (typeof response === 'string' ? JSON.parse(response) : response),
				} as Response;
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
