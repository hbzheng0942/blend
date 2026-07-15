/** 将公共 Worker 地址写入 Expo manifest，避免 monorepo Web 导出时环境变量未被 Metro 内联。 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    agnesProxyUrl: process.env.EXPO_PUBLIC_AGNES_PROXY_URL || "",
  },
});
