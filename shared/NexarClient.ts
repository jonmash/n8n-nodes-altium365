import { GraphQLClient } from 'graphql-request';
import { getSdk } from './generated/graphql';

interface TokenCache {
	token: string;
	expiresAt: number; // Unix timestamp in milliseconds
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
	scope: string;
}

export class NexarClient {
	private clientId: string;
	private clientSecret: string;
	private tokenCache: TokenCache | null = null;
	private graphqlClient: GraphQLClient;
	private sdk: ReturnType<typeof getSdk>;

	private static readonly TOKEN_ENDPOINT = 'https://identity.nexar.com/connect/token';
	private static readonly GRAPHQL_ENDPOINT = 'https://api.nexar.com/graphql';
	// Refresh token 5 minutes before expiry to prevent race conditions
	private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

	constructor(clientId: string, clientSecret: string) {
		this.clientId = clientId;
		this.clientSecret = clientSecret;

		this.graphqlClient = new GraphQLClient(NexarClient.GRAPHQL_ENDPOINT, {
			headers: {
				'User-Agent': 'n8n-nodes-altium365/0.1.0',
			},
		});

		this.sdk = getSdk(this.graphqlClient);
	}

	/**
	 * Get a valid access token, fetching a new one if needed
	 */
	private async getToken(): Promise<string> {
		const now = Date.now();

		if (this.tokenCache && this.tokenCache.expiresAt > now) {
			return this.tokenCache.token;
		}

		const params = new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: this.clientId,
			client_secret: this.clientSecret,
			scope: 'design.domain',
		});

		const response = await fetch(NexarClient.TOKEN_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params.toString(),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OAuth token request failed: ${response.status} ${errorText}`);
		}

		const tokenData: TokenResponse = await response.json();

		// Calculate token expiration time with buffer
		// tokenData.expires_in is in seconds (typically 86400 = 24 hours for Nexar)
		// Subtract TOKEN_REFRESH_BUFFER_MS to refresh before actual expiry
		const expiresAt = now + tokenData.expires_in * 1000 - NexarClient.TOKEN_REFRESH_BUFFER_MS;

		this.tokenCache = {
			token: tokenData.access_token,
			expiresAt,
		};

		this.graphqlClient.setHeader('Authorization', `Bearer ${tokenData.access_token}`);

		return tokenData.access_token;
	}

	/**
	 * Get the fully typed GraphQL SDK
	 */
	async getSdk() {
		await this.getToken();
		return this.sdk;
	}

	/**
	 * Execute a raw GraphQL query (for custom queries not in the SDK)
	 */
	async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		await this.getToken();
		return this.graphqlClient.request<T>(query, variables);
	}
}
