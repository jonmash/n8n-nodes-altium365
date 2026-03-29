import type { IExecuteFunctions, IPollFunctions, IHttpRequestOptions, IDataObject } from 'n8n-workflow';
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
	private static readonly TOKEN_URL = 'https://identity.nexar.com/connect/token';
	private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

	/**
	 * Create a NexarClient
	 * @param context - n8n execution context (IExecuteFunctions or IPollFunctions)
	 * @param credentialType - The credential type name ('altium365NexarApi' or 'altium365NexarApiToken')
	 * @param apiUrl - Optional API endpoint URL (defaults to api.nexar.com)
	 */
	constructor(context: ExecutionContext, credentialType: string = 'altium365NexarApiToken', apiUrl?: string) {
		this.context = context;
		this.credentialType = credentialType;
		this.apiUrl = apiUrl || NexarClient.DEFAULT_GRAPHQL_ENDPOINT;

		// Create a custom GraphQL client that handles token refresh
		this.graphqlClient = new GraphQLClient(this.apiUrl, {
			headers: {
				'User-Agent': 'n8n-nodes-altium365/0.3.3',
			},
			fetch: async (url: string | URL | Request, options?: Record<string, any>) => {
				const urlString = typeof url === 'string' ? url : url.toString();

				// Ensure we have a valid token before making request
				const accessToken = await this.getValidAccessToken();

				// Add Authorization header
				const headers = {
					...(options?.headers || {}),
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				};

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: urlString,
					headers,
					body: options?.body as string,
					json: false, // Body is already JSON stringified by graphql-request
					returnFullResponse: true,
				};

				try {
					const response = await this.context.helpers.request(requestOptions);

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
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.error('[Altium365] NexarClient fetch error:', errorMessage);
					throw error;
				}
			},
		});

		this.sdk = getSdk(this.graphqlClient);
	}

	/**
	 * Get a valid access token, refreshing if needed
	 */
	private async getValidAccessToken(): Promise<string> {
		const credentials = await this.context.getCredentials(this.credentialType);

		const accessToken = credentials.accessToken as string;
		const refreshToken = credentials.refreshToken as string;
		const tokenExpiry = credentials.tokenExpiry as number;

		if (!accessToken || !refreshToken) {
			throw new Error('Access token and refresh token are required. Please run get-tokens.js to obtain tokens.');
		}

		const now = Date.now();
		const expiresAt = tokenExpiry * 1000; // Convert to milliseconds

		// Check if token is expired or will expire soon (within 5 minutes)
		if (now + NexarClient.TOKEN_REFRESH_BUFFER_MS >= expiresAt) {
			console.log('[Altium365] Token expired or expiring soon, refreshing...');
			return await this.refreshAccessToken(credentials);
		}

		return accessToken;
	}

	/**
	 * Refresh the access token using the refresh token
	 */
	private async refreshAccessToken(credentials: IDataObject): Promise<string> {
		const clientId = credentials.clientId as string;
		const clientSecret = credentials.clientSecret as string;
		const refreshToken = credentials.refreshToken as string;

		if (!clientId || !clientSecret) {
			throw new Error('Client ID and Client Secret are required for token refresh');
		}

		const tokenParams = new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
		});

		try {
			const response = await this.context.helpers.request({
				method: 'POST',
				url: NexarClient.TOKEN_URL,
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: tokenParams.toString(),
				json: false,
			});

			const tokenData = typeof response === 'string' ? JSON.parse(response) : response;

			if (tokenData.error) {
				throw new Error(`Token refresh failed: ${tokenData.error_description || tokenData.error}`);
			}

			const newAccessToken = tokenData.access_token;
			const newRefreshToken = tokenData.refresh_token || refreshToken; // Some OAuth servers don't return new refresh token
			const expiresIn = tokenData.expires_in || 86400; // Default to 24 hours if not provided
			const newTokenExpiry = Math.floor(Date.now() / 1000) + expiresIn;

			// Update the stored credentials with new tokens
			// Note: n8n doesn't provide a direct way to update credentials from node code
			// The workaround is to update the credential via the credential update mechanism
			// For now, we log a warning and let the user know they need to update manually if this fails
			console.log('[Altium365] Token refreshed successfully');
			console.log('[Altium365] New token expires at:', new Date(newTokenExpiry * 1000).toISOString());

			// Try to update credentials if possible
			// Note: This may not work depending on n8n version and execution context
			try {
				// Store updated tokens back to credential
				credentials.accessToken = newAccessToken;
				credentials.refreshToken = newRefreshToken;
				credentials.tokenExpiry = newTokenExpiry;
			} catch (updateError) {
				console.warn('[Altium365] Could not update stored credentials:', updateError);
				console.warn('[Altium365] Token refresh succeeded but credentials not persisted. You may need to run get-tokens.js again when token expires.');
			}

			return newAccessToken;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to refresh access token: ${errorMessage}`, {
				cause: error,
			});
		}
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
