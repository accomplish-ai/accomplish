/**
 * Unit tests for PermissionDialog component
 * Tests rendering of the inline card for various permission request types
 * @module __tests__/unit/renderer/components/execution/PermissionDialog.unit.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Import helpers first — they register vi.mock stubs before PermissionDialog is loaded
import { createToolPermission, createFilePermission } from './permissionDialogTestHelpers';

import { PermissionDialog } from '@/components/execution/PermissionDialog';

describe('PermissionDialog', () => {
  describe('renders the inline card', () => {
    it('should render with data-testid execution-permission-card', () => {
      const onRespond = vi.fn();
      render(<PermissionDialog permissionRequest={createToolPermission()} onRespond={onRespond} />);

      expect(screen.getByTestId('execution-permission-card')).toBeInTheDocument();
    });

    it('should render allow and deny buttons for tool permission', () => {
      const onRespond = vi.fn();
      render(<PermissionDialog permissionRequest={createToolPermission()} onRespond={onRespond} />);

      expect(screen.getByTestId('permission-allow-button')).toBeInTheDocument();
      expect(screen.getByTestId('permission-deny-button')).toBeInTheDocument();
    });

    it('should show "Permission Required" heading for tool type', () => {
      const onRespond = vi.fn();
      render(<PermissionDialog permissionRequest={createToolPermission()} onRespond={onRespond} />);

      expect(screen.getByText('Permission Required')).toBeInTheDocument();
    });

    it('should show "File Permission Required" heading for file type', () => {
      const onRespond = vi.fn();
      render(<PermissionDialog permissionRequest={createFilePermission()} onRespond={onRespond} />);

      expect(screen.getByText('File Permission Required')).toBeInTheDocument();
    });

    it('should show "File Deletion Warning" heading for delete operation', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createFilePermission({ fileOperation: 'delete' })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByText('File Deletion Warning')).toBeInTheDocument();
    });
  });

  describe('allow and deny interactions', () => {
    it('should call onRespond with true when allow button is clicked', () => {
      const onRespond = vi.fn();
      render(<PermissionDialog permissionRequest={createToolPermission()} onRespond={onRespond} />);

      fireEvent.click(screen.getByTestId('permission-allow-button'));

      expect(onRespond).toHaveBeenCalledWith(true, undefined, undefined);
    });

    it('should call onRespond with false when deny button is clicked', () => {
      const onRespond = vi.fn();
      render(<PermissionDialog permissionRequest={createToolPermission()} onRespond={onRespond} />);

      fireEvent.click(screen.getByTestId('permission-deny-button'));

      expect(onRespond).toHaveBeenCalledWith(false, undefined, undefined);
    });
  });

  describe('tool permission inline card', () => {
    it('should display tool name in allow heading', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createToolPermission({ toolName: 'Bash' })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByText(/allow bash/i)).toBeInTheDocument();
    });

    it('should display tool input details when provided', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createToolPermission({
            toolName: 'Bash',
            toolInput: { command: 'ls -la' },
          })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByText(/ls -la/)).toBeInTheDocument();
    });
  });

  describe('file permission inline card', () => {
    it('should display the file path', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createFilePermission({ filePath: '/tmp/output.txt' })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByText('/tmp/output.txt')).toBeInTheDocument();
    });

    it('should display the operation badge in uppercase', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createFilePermission({ fileOperation: 'modify' })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByText('MODIFY')).toBeInTheDocument();
    });

    it('should display target path for move operations', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createFilePermission({
            fileOperation: 'move',
            filePath: '/old/path.txt',
            targetPath: '/new/path.txt',
          })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByText('/old/path.txt')).toBeInTheDocument();
      expect(screen.getByText(/new\/path\.txt/)).toBeInTheDocument();
    });

    it('should show Delete button label for file delete operations', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createFilePermission({ fileOperation: 'delete' })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByTestId('permission-allow-button')).toHaveTextContent('Delete');
    });

    it('should show a safe fallback when a file permission has no file path data', () => {
      const onRespond = vi.fn();
      render(
        <PermissionDialog
          permissionRequest={createFilePermission({ filePath: undefined })}
          onRespond={onRespond}
        />,
      );

      expect(screen.getByTestId('execution-permission-card')).toBeInTheDocument();
      expect(screen.queryByText(/undefined/i)).toBeNull();
    });
  });
});
