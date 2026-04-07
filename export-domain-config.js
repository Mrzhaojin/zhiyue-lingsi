#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const domainConfigPath = path.join(process.cwd(), 'domain-config.json');

if (fs.existsSync(domainConfigPath)) {
  const config = JSON.parse(fs.readFileSync(domainConfigPath, 'utf8'));
  
  console.log('=== 域名申请配置信息 ===');
  console.log(`项目名称: ${config.domainApplication.projectName}`);
  console.log(`Vercel 项目 ID: ${config.domainApplication.vercelProjectId}`);
  console.log('推荐域名:');
  config.domainApplication.recommendedDomains.forEach(domain => {
    console.log(`  - ${domain}`);
  });
  console.log('申请步骤:');
  config.domainApplication.applicationSteps.forEach((step, index) => {
    console.log(`  ${index + 1}. ${step}`);
  });
  console.log(`Vercel 控制台地址: ${config.domainApplication.vercelConsoleUrl}`);
  console.log('=====================');
  
  console.log('\n配置文件已导出到 domain-config.json');
} else {
  console.error('域名配置文件不存在');
  process.exit(1);
}
