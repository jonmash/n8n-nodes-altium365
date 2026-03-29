import type { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';

export class Altium365NexarApiToken implements ICredentialType {
	name = 'altium365NexarApiToken';

	displayName = 'Altium 365 Nexar API (Token)';

	documentationUrl = 'https://support.nexar.com/support/solutions/articles/101000471994-authorization';

	properties: INodeProperties[] = [
		{
			displayName: 'Workspace URL',
			name: 'workspaceUrl',
			type: 'string',
			default: '',
			placeholder: 'https://yourworkspace.365.altium.com/',
			required: true,
			description: 'Your Altium 365 workspace URL',
		},
		{
			displayName: 'API Endpoint URL',
			name: 'apiEndpointUrl',
			type: 'string',
			default: '',
			placeholder: 'https://uw.api.nexar.com/graphql',
			required: true,
			description: 'Your workspace-specific API endpoint URL (from workspace.location.apiServiceUrl)',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'OAuth2 Client ID from Nexar Portal',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'OAuth2 Client Secret from Nexar Portal',
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'OAuth2 access token (will be auto-refreshed)',
		},
		{
			displayName: 'Refresh Token',
			name: 'refreshToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'OAuth2 refresh token',
		},
		{
			displayName: 'Token Expiry',
			name: 'tokenExpiry',
			type: 'number',
			default: 0,
			description: 'Unix timestamp when token expires',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiEndpointUrl}}',
			url: '',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': '=Bearer {{$credentials.accessToken}}',
			},
			body: {
				query: 'query { desWorkspaceInfos { url name } }',
			},
		},
	};
}
