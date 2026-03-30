import type { IExecuteFunctions, IPollFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { GraphQLClient } from 'graphql-request';
import { getSdk } from './generated/graphql';

type ExecutionContext = IExecuteFunctions | IPollFunctions;

export class NexarClient {
	private graphqlClient: GraphQLClient;
	private sdk: ReturnType<typeof getSdk>;
	private context: ExecutionContext;
	private credentialType: string;
	private apiUrl: string;

	private static readonly DEFAULT_GRAPHQL_ENDPOINT = 'https://api.nexar.com/graphql';

	/**
	 * Create a NexarClient that delegates all auth to n8n's OAuth2 credential system.
	 *
	 * For credentials extending oAuth2Api, n8n's httpRequestWithAuthentication
	 * automatically injects the Bearer token and handles refresh on 401.
	 */
	constructor(
		context: ExecutionContext,
		credentialType: string = 'altium365NexarApi',
		apiUrl?: string,
	) {
		this.context = context;
		this.credentialType = credentialType;
		this.apiUrl = apiUrl || NexarClient.DEFAULT_GRAPHQL_ENDPOINT;

		this.graphqlClient = new GraphQLClient(this.apiUrl, {
			fetch: async (url: string | URL | Request, options?: Record<string, any>) => {
				const urlString = typeof url === 'string' ? url : url.toString();

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: urlString,
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'n8n-nodes-altium365/0.4.1',
					},
					body: options?.body as string,
					json: false,
				};

				try {
					// n8n handles Bearer token injection and refresh automatically
					const responseBody =
						await this.context.helpers.httpRequestWithAuthentication.call(
							this.context,
							this.credentialType,
							requestOptions,
						);

					const bodyStr =
						typeof responseBody === 'string'
							? responseBody
							: JSON.stringify(responseBody);

					return {
						ok: true,
						status: 200,
						statusText: 'OK',
						text: async () => bodyStr,
						json: async () =>
							typeof responseBody === 'string'
								? JSON.parse(responseBody)
								: responseBody,
						headers: new Headers({ 'content-type': 'application/json' }),
					} as Response;
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.error('[Altium365] Request failed:', errorMessage);
					throw error;
				}
			},
		});

		this.sdk = getSdk(this.graphqlClient);
	}

	getSdk() {
		return this.sdk;
	}

	query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		return this.graphqlClient.request<T>(query, variables);
	}
}
