/**
 * Sentinel marker emitted by the request_google_file_picker MCP tool when
 * it needs the desktop app to open the Google Picker UI. The main process
 * detects this string in the tool output and converts it into a pause action.
 */
export const GOOGLE_FILE_PICKER_MARKER = '__ACCOMPLISH_GOOGLE_FILE_PICKER__';
