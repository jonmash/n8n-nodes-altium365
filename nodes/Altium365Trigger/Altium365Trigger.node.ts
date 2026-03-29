import type {
	IDataObject,
	IPollFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { NexarClient } from '../../shared/NexarClient';

interface WorkflowStaticData {
	lastRevisions?: Record<string, string>; // projectId -> revisionId
	lastProjectIds?: string[];
}

export class Altium365Trigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Altium 365 Trigger',
		name: 'altium365Trigger',
		icon: 'file:altium365trigger.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Triggers on Altium 365 events via polling',
		defaults: {
			name: 'Altium 365 Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'altium365NexarApi',
				required: true,
			},
		],
		polling: true,
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'Project Committed',
						value: 'projectCommitted',
						description: 'Trigger when a project is committed (Git push)',
					},
					{
						name: 'New Project',
						value: 'newProject',
						description: 'Trigger when a new project is created',
					},
				],
				default: 'projectCommitted',
				required: true,
			},

			// Project ID filter for projectCommitted event
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				displayOptions: {
					show: {
						event: ['projectCommitted'],
					},
				},
				default: '',
				description: 'Specific project ID to monitor. Leave empty to monitor all projects in workspace.',
			},

			// Include file changes option
			{
				displayName: 'Include File Changes',
				name: 'includeFileChanges',
				type: 'boolean',
				displayOptions: {
					show: {
						event: ['projectCommitted'],
					},
				},
				default: true,
				description: 'Whether to include the list of changed files in the output',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const credentials = await this.getCredentials('altium365NexarApi');
		const workspaceUrl = credentials.workspaceUrl as string;

		// Get the correct API endpoint for this workspace
		const apiUrl = await NexarClient.getWorkspaceApiUrl(this, workspaceUrl, 'altium365NexarApi');

		// Create client with OAuth2 credentials and workspace-specific API endpoint
		const client = new NexarClient(this, 'altium365NexarApi', apiUrl);

		const workflowStaticData = this.getWorkflowStaticData('node') as WorkflowStaticData;

		if (event === 'projectCommitted') {
			return await Altium365Trigger.prototype.pollProjectCommitted.call(
				this,
				client,
				workspaceUrl,
				workflowStaticData,
			);
		}

		if (event === 'newProject') {
			return await Altium365Trigger.prototype.pollNewProjects.call(
				this,
				client,
				workspaceUrl,
				workflowStaticData,
			);
		}

		return null;
	}

	private async pollProjectCommitted(
		this: IPollFunctions,
		client: NexarClient,
		workspaceUrl: string,
		staticData: WorkflowStaticData,
	): Promise<INodeExecutionData[][] | null> {
		const projectId = this.getNodeParameter('projectId', '') as string;
		const includeFileChanges = this.getNodeParameter('includeFileChanges', true) as boolean;
		const sdk = client.getSdk();

		// Initialize storage for last known revision IDs
		if (!staticData.lastRevisions) {
			staticData.lastRevisions = {};
		}

		const returnData: INodeExecutionData[] = [];

		if (projectId) {
			// Monitor a specific project
			const result = await sdk.GetLatestCommit({ projectId });

			if (!result.desProjectById) {
				throw new NodeOperationError(this.getNode(), `Project ${projectId} not found`);
			}

			const project = result.desProjectById;
			const latestRevision = project.latestRevision;

			if (latestRevision) {
				const lastKnownRevision = staticData.lastRevisions[projectId];

				// If this is a new revision
				if (lastKnownRevision && lastKnownRevision !== latestRevision.revisionId) {
					const commitData: IDataObject = {
						projectId: project.id,
						projectName: project.name,
						revisionId: latestRevision.revisionId,
						message: latestRevision.message,
						author: latestRevision.author,
						committedAt: latestRevision.createdAt,
					};

					if (includeFileChanges) {
						commitData.filesChanged = latestRevision.files;
					}

					returnData.push({
						json: commitData,
					});
				}

				// Update stored revision ID
				staticData.lastRevisions[projectId] = latestRevision.revisionId;
			}
		} else {
			// Monitor all projects in workspace
			const projectsResult = await sdk.GetProjects({
				workspaceUrl,
				first: 100, // TODO: handle pagination if workspace has >100 projects
			});

			if (!projectsResult.desProjects?.nodes) {
				return null;
			}

			// Check each project for new commits
			for (const project of projectsResult.desProjects.nodes) {
				const projectResult = await sdk.GetLatestCommit({ projectId: project.id });

				if (!projectResult.desProjectById?.latestRevision) {
					continue;
				}

				const latestRevision = projectResult.desProjectById.latestRevision;
				const lastKnownRevision = staticData.lastRevisions[project.id];

				// If this is a new revision
				if (lastKnownRevision && lastKnownRevision !== latestRevision.revisionId) {
					const commitData: IDataObject = {
						projectId: project.id,
						projectName: project.name,
						revisionId: latestRevision.revisionId,
						message: latestRevision.message,
						author: latestRevision.author,
						committedAt: latestRevision.createdAt,
					};

					if (includeFileChanges) {
						commitData.filesChanged = latestRevision.files;
					}

					returnData.push({
						json: commitData,
					});
				}

				// Update stored revision ID
				staticData.lastRevisions[project.id] = latestRevision.revisionId;
			}
		}

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}

	private async pollNewProjects(
		this: IPollFunctions,
		client: NexarClient,
		workspaceUrl: string,
		staticData: WorkflowStaticData,
	): Promise<INodeExecutionData[][] | null> {
		const sdk = client.getSdk();

		// Initialize storage for known project IDs
		if (!staticData.lastProjectIds) {
			staticData.lastProjectIds = [];
		}

		const result = await sdk.GetProjects({
			workspaceUrl,
			first: 100, // TODO: handle pagination
		});

		if (!result.desProjects?.nodes) {
			return null;
		}

		const returnData: INodeExecutionData[] = [];
		const currentProjectIds = result.desProjects.nodes.map((p) => p.id);

		// Find new projects
		for (const project of result.desProjects.nodes) {
			if (!staticData.lastProjectIds.includes(project.id)) {
				returnData.push({
					json: project,
				});
			}
		}

		// Update stored project IDs
		staticData.lastProjectIds = currentProjectIds;

		if (returnData.length === 0) {
			return null;
		}

		return [returnData];
	}
}
