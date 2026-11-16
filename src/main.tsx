// First: carry data saved under the old name over to the new keys.
import '@/lib/storage-migration';
import { watchErrors } from '@/lib/diagnostics';
import { commandLog } from '@/lib/commands';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import AppLayout from '@/components/layouts/app-layout';
import Editor from '@/components/editor/editor';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

watchErrors();
// `__strudelton.commands()` in the console: the last changes to the song.
Object.assign((window as unknown as { __strudelton: object }).__strudelton, {
  commands: commandLog,
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReactFlowProvider>
        <AppLayout>
          <Editor />
        </AppLayout>
      </ReactFlowProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
