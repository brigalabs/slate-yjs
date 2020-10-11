import { Editor, Operation } from 'slate';
import { YjsEditor } from '../src/plugin/yjsEditor';
import * as Y from 'yjs';
import { applySlateOps as applySlateOperations } from '../src/apply';
import { SyncElement } from '../src/model';

export interface TestEditor extends YjsEditor {
  shouldCaptureYjsUpdates: boolean;
  capturedYjsUpdates: Uint8Array[];
  onChangeComplete: () => void;
}

export const TestEditor = {
  /**
   * Apply slate ops to Yjs
   */
  applySlateOpsToYjs: (e: TestEditor, operations: Operation[]) => {
    e.doc.transact(() => {
      applySlateOperations(e.syncDoc, operations);
    });
  },

  /**
   * Capture Yjs updates generated by this editor.
   */
  captureYjsUpdate: (e: TestEditor, update: Uint8Array, _origin: any) => {
    if (!e.shouldCaptureYjsUpdates) return;
    e.capturedYjsUpdates.push(update);
  },

  /**
   * Return captured Yjs updates.
   */
  getCapturedYjsUpdates: (e: TestEditor): Uint8Array[] => {
    const result = e.capturedYjsUpdates;
    e.capturedYjsUpdates = [];
    return result;
  },

  /**
   * Apply one Yjs update to Yjs.
   */
  applyYjsUpdateToYjs: (
    e: TestEditor,
    update: Uint8Array
  ): Promise<void> => {
    return new Promise((resolve) => {
      e.shouldCaptureYjsUpdates = false;
      e.onChangeComplete = () => {
        e.onChangeComplete = () => void {};
        resolve();
      };
      Y.applyUpdate(e.doc, update);
      e.shouldCaptureYjsUpdates = true;
    });
  },

  /**
   * Apply multiple Yjs updates to Yjs.
   */
  applyYjsUpdatesToYjs: async (e: TestEditor, updates: Uint8Array[]) => {
    await Promise.all(
      updates.map((update) => {
        TestEditor.applyYjsUpdateToYjs(e, update);
      })
    );
  },

  /**
   * Apply one slate operation to slate.
   */
  applySlateOpToSlate: (e: TestEditor, op: Operation): Promise<void> => {
    return new Promise((resolve) => {
      e.onChangeComplete = () => {
        e.onChangeComplete = () => void {};
        resolve();
      };
      e.apply(op);
    });
  },

  /**
   * Apply multiple slate operations to slate.
   */
  applySlateOpsToSlate: async (e: TestEditor, operations: Operation[]) => {
    await Promise.all(
      operations.map((op) => {
        TestEditor.applySlateOpToSlate(e, op);
      })
    );
  },
};

export const withTest = <T extends Editor>(editor: T): T & TestEditor => {
  const e = editor as T & TestEditor;

  const doc = new Y.Doc();
  const syncDoc = doc.getArray<SyncElement>('content');

  doc.on('update', (updateMessage: Uint8Array, origin: any) => {
    TestEditor.captureYjsUpdate(e, updateMessage, origin);
  });
  syncDoc.observeDeep((events) => {
    YjsEditor.applyEvents(e, events);
  });

  e.doc = doc;
  e.syncDoc = syncDoc;
  e.isRemote = false;
  e.shouldCaptureYjsUpdates = true;
  e.capturedYjsUpdates = [];

  const { onChange } = editor;
  e.onChange = () => {
    if (!e.isRemote) {
      TestEditor.applySlateOpsToYjs(e, e.operations);
    }

    if (onChange) {
      onChange();
    }

    if (e.onChangeComplete) {
      e.onChangeComplete();
    }
  };

  return e;
};