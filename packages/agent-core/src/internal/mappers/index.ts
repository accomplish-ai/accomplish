/**
 * Internal mappers - convert internal types to public DTOs.
 *
 * Use these mappers before sending data to external consumers.
 */

export {
  toTaskDTO,
  toTaskDTOArray,
  toTaskProgressDTO,
  toTaskMessageDTO,
  hasInternalFields,
} from './task.mapper.js';
