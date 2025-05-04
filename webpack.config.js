const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './background.ts',
    contentScript: './contentScript.ts',
    'popup/popup': './popup/popup.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      // Polyfills for browser compatibility if needed
      "path": false,
      "fs": false,
      "os": false
    }
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
        { from: 'popup/popup.html', to: 'popup/popup.html' },
        { from: 'popup/popup.css', to: 'popup/popup.css' }
      ],
    }),
  ],
  optimization: {
    minimize: true,
    // Ensures compatibility with older browsers
    minimizer: [
      '...'
    ],
  },
  // Ensures proper source mapping for debugging
  devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',
}; 