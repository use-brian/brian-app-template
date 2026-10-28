/** Trusted ESM server source, excluded from the static Home bundle. */
import type {
  ApplicationModuleDefinition,
  ApplicationRegisteredCommand,
  ApplicationRegisteredOperation,
} from '@use-brian/brian-app/module';

type Query<Transaction> = ApplicationRegisteredOperation<Transaction> & {
  authorizeResult: NonNullable<ApplicationRegisteredOperation<Transaction>['authorizeResult']>;
};

export interface ApplicationHandlers<Transaction> {
  lookup: Query<Transaction>;
  change: Omit<ApplicationRegisteredCommand<Transaction>, 'eventKey'>;
}

/**
 * Bind real domain input schemas, canonical stores and current ACL in the host.
 * All handlers receive its transaction; no store, owner fallback or allow is supplied.
 * Pass the result to the host's existing defineApplicationModules composition.
 */
export function createApplicationModule<Transaction>(
  handlers: ApplicationHandlers<Transaction>,
): ApplicationModuleDefinition<Transaction> {
  if (!handlers?.lookup?.authorize || !handlers.lookup.authorizeResult
    || !handlers.change?.authorize || !handlers.change.authorizeResult) {
    throw new Error('operation_not_available');
  }
  return {
    key: 'example_module',
    defaultState: 'disabled',
    application: {
      version: '1',
      dependencies: [],
      resources: [{
        typeKey: 'example_record',
        origin: { kind: 'native', moduleKey: 'example_module' },
        schemaVersion: '1',
        fields: [{ key: 'title', label: 'Title', kind: 'text' }],
      }],
      queries: ['lookup'],
      commands: ['change'],
      events: ['example.changed'],
      policyCapabilities: [],
      backgroundHandlers: [],
      uiContributions: [],
    },
    queries: { lookup: handlers.lookup },
    commands: { change: { ...handlers.change, eventKey: 'example.changed' } },
  };
}
