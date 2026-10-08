declare module 'virtual:ttrpg-message-validator' {
  const validate: import('ajv').ValidateFunction;
  export default validate;
}

declare module 'virtual:ttrpg-text-sprite-validator' {
  import type { ValidateFunction } from 'ajv';
  const validate: ValidateFunction;
  export default validate;
}
