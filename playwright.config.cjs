'use strict';
const {defineConfig,devices}=require('@playwright/test');
const port=Number(process.env.OFFRYA_E2E_PORT||4173);
const baseURL='http://127.0.0.1:'+port;

module.exports=defineConfig({
  testDir:'./e2e',
  timeout:30000,
  expect:{timeout:8000},
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI?1:0,
  workers:process.env.CI?2:undefined,
  reporter:process.env.CI?[['line'],['html',{outputFolder:'playwright-report',open:'never'}]]:'list',
  use:{baseURL,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'android-chromium',use:{...devices['Pixel 7']}}
  ],
  webServer:{
    command:'node server.js',
    url:baseURL+'/api/health',
    reuseExistingServer:!process.env.CI,
    timeout:45000,
    env:{PORT:String(port),NODE_ENV:'test'}
  }
});
