import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { NexarClient } from '../../shared/NexarClient';

export class Altium365 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Altium 365',
		name: 'altium365',
		icon: 'file:altium365.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with Altium 365 via Nexar API',
		defaults: {
			name: 'Altium 365',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'altium365NexarApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Project',
						value: 'project',
					},
					{
						name: 'Workspace',
						value: 'workspace',
					},
				],
				default: 'project',
			},

			// Project operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['project'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a project by ID',
						action: 'Get a project',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Get many projects',
						action: 'Get many projects',
					},
					{
						name: 'Get Latest Commit',
						value: 'getLatestCommit',
						description: 'Get the latest commit for a project',
						action: 'Get latest commit',
					},
					{
						name: 'Get Commit History',
						value: 'getCommitHistory',
						description: 'Get commit history for a project',
						action: 'Get commit history',
					},
					{
						name: 'Update Parameters',
						value: 'updateParameters',
						description: 'Update project parameters',
						action: 'Update project parameters',
					},
				],
				default: 'get',
			},

			// Workspace operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['workspace'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						description: 'Get all workspaces',
						action: 'Get all workspaces',
					},
				],
				default: 'getAll',
			},

			// Project ID field (used by multiple operations)
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['project'],
						operation: ['get', 'getLatestCommit', 'getCommitHistory', 'updateParameters'],
					},
				},
				default: '',
				description: 'The ID of the project',
			},

			// Limit field for getMany
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['project'],
						operation: ['getMany', 'getCommitHistory'],
					},
				},
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
			},

			// Return all toggle for getMany
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['project'],
						operation: ['getMany', 'getCommitHistory'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// Get credentials
		const credentials = await this.getCredentials('altium365NexarApi');
		const client = new NexarClient(
			credentials.clientId as string,
			credentials.clientSecret as string,
		);

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'workspace') {
					if (operation === 'getAll') {
						const sdk = await client.getSdk();
						const result = await sdk.GetWorkspaceInfos();

						if (!result.desWorkspaceInfos) {
							throw new NodeOperationError(this.getNode(), 'No workspaces found');
						}

						result.desWorkspaceInfos.forEach((workspace) => {
							returnData.push({
								json: workspace,
								pairedItem: { item: i },
							});
						});
					}
				}

				if (resource === 'project') {
					const sdk = await client.getSdk();

					if (operation === 'get') {
						const projectId = this.getNodeParameter('projectId', i) as string;
						const result = await sdk.GetProjectById({ id: projectId });

						if (!result.desProjectById) {
							throw new NodeOperationError(
								this.getNode(),
								`Project with ID ${projectId} not found`,
							);
						}

						returnData.push({
							json: result.desProjectById,
							pairedItem: { item: i },
						});
					}

					if (operation === 'getMany') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = this.getNodeParameter('limit', i, 50) as number;
						const workspaceUrl = credentials.workspaceUrl as string;

						const result = await sdk.GetProjects({
							workspaceUrl,
							first: returnAll ? undefined : limit,
						});

						if (!result.desProjects?.nodes) {
							throw new NodeOperationError(this.getNode(), 'No projects found');
						}

						result.desProjects.nodes.forEach((project) => {
							returnData.push({
								json: project,
								pairedItem: { item: i },
							});
						});
					}

					if (operation === 'getLatestCommit') {
						const projectId = this.getNodeParameter('projectId', i) as string;
						const result = await sdk.GetLatestCommit({ projectId });

						if (!result.desProjectById?.latestRevision) {
							throw new NodeOperationError(
								this.getNode(),
								`No commits found for project ${projectId}`,
							);
						}

						returnData.push({
							json: {
								projectId: result.desProjectById.id,
								projectName: result.desProjectById.name,
								...result.desProjectById.latestRevision,
							},
							pairedItem: { item: i },
						});
					}

					if (operation === 'getCommitHistory') {
						const projectId = this.getNodeParameter('projectId', i) as string;
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = this.getNodeParameter('limit', i, 50) as number;

						const result = await sdk.GetCommitHistory({
							projectId,
							first: returnAll ? undefined : limit,
						});

						if (!result.desProjectById?.revisions?.nodes) {
							throw new NodeOperationError(
								this.getNode(),
								`No commit history found for project ${projectId}`,
							);
						}

						result.desProjectById.revisions.nodes.forEach((commit) => {
							returnData.push({
								json: {
									projectId: result.desProjectById!.id,
									projectName: result.desProjectById!.name,
									...commit,
								},
								pairedItem: { item: i },
							});
						});
					}

					if (operation === 'updateParameters') {
						const projectId = this.getNodeParameter('projectId', i) as string;
						// TODO: Add parameter input fields
						throw new NodeOperationError(
							this.getNode(),
							'Update Parameters operation not yet implemented',
						);
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					returnData.push({
						json: {
							error: errorMessage,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
