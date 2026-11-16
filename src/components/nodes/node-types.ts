import { nodeDefinitions } from './registry';
import { createDefinitionComponent } from './shared/definition-node';

/**
 * The canvas's React component for each node type. Kept apart from the
 * registry: these components use the store, and the store (through the
 * program code) uses the registry, so only the canvas imports this.
 */
export const nodeTypes = Object.fromEntries(
  Object.values(nodeDefinitions).map((definition) => [
    definition.id,
    createDefinitionComponent(definition),
  ]),
);
