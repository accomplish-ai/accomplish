/**
 * Type definitions for i18n translations
 *
 * This module extends the i18next types to include our custom namespaces
 * and provides type safety for translation keys.
 */

import 'i18next';

// Define the shape of our translation resources
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      common: {
        app: {
          name: string;
          description: string;
        };
        menu: {
          file: string;
          edit: string;
          view: string;
          help: string;
        };
        sidebar: {
          newTask: string;
          settings: string;
          searchTasks: string;
          noConversations: string;
        };
        task: {
          title: string;
          description: string;
          status: string;
          running: string;
          queued: string;
          completed: string;
          error: string;
          cancelled: string;
        };
        buttons: {
          save: string;
          cancel: string;
          delete: string;
          edit: string;
          close: string;
          ok: string;
          yes: string;
          no: string;
          retry: string;
          copy: string;
          paste: string;
        };
        messages: {
          welcome: string;
          loading: string;
          error: string;
          success: string;
          warning: string;
          info: string;
        };
        settings: {
          title: string;
          aiProvider: string;
          apiKey: string;
          model: string;
          language: string;
          theme: string;
          debugMode: string;
          about: string;
          version: string;
        };
        home: {
          title: string;
          placeholder: string;
          examplePrompts: string;
          examples: {
            calendarPrepNotes: {
              title: string;
              description: string;
              prompt: string;
            };
            inboxPromoCleanup: {
              title: string;
              description: string;
              prompt: string;
            };
            competitorPricingDeck: {
              title: string;
              description: string;
              prompt: string;
            };
            notionApiAudit: {
              title: string;
              description: string;
              prompt: string;
            };
            stagingVsProdVisual: {
              title: string;
              description: string;
              prompt: string;
            };
            prodBrokenLinks: {
              title: string;
              description: string;
              prompt: string;
            };
            portfolioMonitoring: {
              title: string;
              description: string;
              prompt: string;
            };
            jobApplicationAutomation: {
              title: string;
              description: string;
              prompt: string;
            };
            eventCalendarBuilder: {
              title: string;
              description: string;
              prompt: string;
            };
          };
        };
        taskInput: {
          placeholder: string;
          submit: string;
          working: string;
          speechError: string;
          retry: string;
        };
        execution: {
          status: {
            queued: string;
            running: string;
            completed: string;
            failed: string;
            cancelled: string;
            interrupted: string;
            stopped: string;
          };
          waiting: string;
          waitingDetails: string;
          waitingFollowUp: string;
          chromeNotInstalled: string;
          installingBrowser: string;
          downloading: string;
          oneTimeSetup: string;
          firstTaskTakesLonger: string;
          browserDownloadTitle: string;
          fileDeletionWarning: string;
          filesWillBeDeleted: string;
          thisFileWillBeDeleted: string;
          cannotBeUndone: string;
          previewContent: string;
          filePermissionRequired: string;
          permissionRequired: string;
          question: string;
          allow: string;
          deny: string;
          cancel: string;
          delete: string;
          deleteAll: string;
          submit: string;
          continue: string;
          doneContinue: string;
          giveNewInstructions: string;
          sendNewInstruction: string;
          askForSomething: string;
          startNewTask: string;
          taskStopped: string;
          taskCompleted: string;
          taskFailed: string;
          goHome: string;
          stopAgent: string;
          copyToClipboard: string;
          export: string;
          exported: string;
          clear: string;
          debugLogs: string;
          noDebugLogs: string;
          noLogsMatch: string;
          searchLogs: string;
          system: string;
          processing: string;
          tool: string;
          enterDifferentOption: string;
          orTypeYourOwn: string;
          nextMatch: string;
          prevMatch: string;
          allowTool: string;
          send: string;
        };
        thinking: {
          doing: string;
          executing: string;
          running: string;
          handling: string;
          accomplishing: string;
          retried: string;
          readingFiles: string;
          findingFiles: string;
          searchingCode: string;
          runningCommand: string;
          writingFile: string;
          editingFile: string;
          runningAgent: string;
          fetchingWebpage: string;
          searchingWeb: string;
          executingBrowserAction: string;
          navigating: string;
          readingPage: string;
          clicking: string;
          typing: string;
          takingScreenshot: string;
          runningScript: string;
          pressingKeys: string;
          scrolling: string;
          hovering: string;
          selectingOption: string;
          waiting: string;
          managingTabs: string;
          gettingPages: string;
          highlighting: string;
          browserSequence: string;
          uploadingFile: string;
          dragging: string;
          gettingText: string;
          checkingVisibility: string;
          checkingState: string;
          switchingFrame: string;
          typingInCanvas: string;
          browserActions: string;
          requestingPermission: string;
          askingQuestion: string;
          completingTask: string;
          thinking: string;
          checkpoint: string;
          startingTask: string;
        };
        errors: {
          generic: string;
          network: string;
          apiError: string;
          fileNotFound: string;
          permissionDenied: string;
        };
      };
    };
    defaultNS: 'common';
    returnNull: false;
    returnObjects: false;
  }
}

export {};
