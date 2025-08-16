// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'], // 👈 required for Expo; includes TS/JS transforms
    plugins: [
      // dotenv (your .env -> @env)
      ['module:react-native-dotenv', {
        moduleName: '@env',
        path: '.env',
        allowUndefined: true,
      }],
      '@babel/plugin-transform-flow-strip-types',
      'react-native-reanimated/plugin',
    ],
  };
};
