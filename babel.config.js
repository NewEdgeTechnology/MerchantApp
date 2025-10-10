// babel.config.js (CommonJS)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // .env -> import { KEY } from '@env'
      ['module:react-native-dotenv', {
        moduleName: '@env',
        path: '.env',
        allowUndefined: true,
      }],

      // If you actually use Flow types; otherwise remove this line.
      '@babel/plugin-transform-flow-strip-types',

      // MUST be last:
      'react-native-worklets/plugin',
    ],
  };
};
