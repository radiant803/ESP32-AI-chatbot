const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'../src/02-api.js'),'utf8');
const pre=`const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)); class ApiError extends Error{constructor(c,m,h,s){super(m);this.code=c;this.hint=h;this.status=s}}
const Store={settings:{maxTokens:4096}}; const safe=(f,d)=>{try{return f()}catch(_){return d}}; const fmtBytes=n=>n+'B'; const esc=x=>x; const Dev0={};`;
const fn=new Function(pre+src+`; return {reasoningSpec,levelFor,reasoningFor,buildRequest,modelCaps};`);
const {reasoningSpec,reasoningFor,buildRequest,modelCaps}=fn();
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m)} else console.log('ok  ',m)};
const msg=[{role:'user',text:'hi'}];
const B=(p,m,o={})=>buildRequest(p,{model:m,messages:msg,temperature:0.7,...o}).body;
// OpenAI
let b=B('openai','gpt-5-nano',{effort:'low',think:true}); ok(b.reasoning.effort==='low'&&b.reasoning.summary==='auto'&&b.temperature===undefined,'gpt-5-nano low');
b=B('openai','gpt-5-nano',{effort:'medium',think:false}); ok(b.reasoning.effort==='medium','gpt-5-nano cannot be off: chat flag ignored');
b=B('openai','gpt-5-nano',{effort:'high',quiet:true}); ok(b.reasoning.effort==='minimal'&&!b.reasoning.summary,'gpt-5-nano quiet -> minimal, no summary');
b=B('openai','gpt-5.6-luna',{effort:'high',quiet:true}); ok(b.reasoning.effort==='none','gpt-5.6-luna quiet -> none');
b=B('anthropic','claude-sonnet-5-5',{effort:'high',quiet:true}); ok(!b.thinking,'claude quiet -> no thinking');
ok(JSON.stringify(reasoningSpec('openai','gpt-5-nano').levels)==='["minimal","low","medium","high"]','gpt-5-nano levels');
b=B('openai','gpt-5.6-luna',{effort:'high',think:false}); ok(b.reasoning.effort==='none'&&!b.reasoning.summary,'gpt-5.6-luna off -> none');
b=B('openai','gpt-5.6-luna',{effort:'high',think:true}); ok(b.reasoning.effort==='high','gpt-5.6-luna high');
b=B('openai','gpt-5.1',{effort:'minimal',think:true}); ok(b.reasoning.effort==='low','gpt-5.1 minimal->low (nearest)');
b=B('openai','o4-mini',{effort:'low'}); ok(b.reasoning.effort==='low','o4-mini low');
b=B('openai','gpt-4o-mini',{effort:'high'}); ok(!b.reasoning&&b.temperature===0.7,'gpt-4o-mini no reasoning, temperature kept');
ok(reasoningSpec('openai','gpt-5-chat-latest')===null,'gpt-5-chat none');
ok(JSON.stringify(reasoningSpec('openai','gpt-5-pro').levels)==='["high"]','gpt-5-pro high only');
// Anthropic
b=B('anthropic','claude-sonnet-5-5',{effort:'high',think:true}); ok(b.thinking&&b.thinking.budget_tokens===12000&&b.max_tokens>=13024&&b.temperature===undefined,'claude thinking high');
b=B('anthropic','claude-sonnet-5-5',{effort:'high',think:false}); ok(!b.thinking&&b.temperature===0.7,'claude thinking off keeps temperature');
ok(reasoningSpec('anthropic','claude-3-5-haiku')===null,'claude 3.5 haiku no thinking');
// Google
b=B('google','gemini-2.5-flash',{effort:'medium',think:true}); ok(b.generationConfig.thinkingConfig.thinkingBudget===8192,'gemini flash medium budget');
b=B('google','gemini-2.5-flash',{think:false}); ok(b.generationConfig.thinkingConfig.thinkingBudget===0,'gemini flash off=0');
b=B('google','gemini-2.5-pro',{think:false}); ok(b.generationConfig.thinkingConfig.thinkingBudget===8192,'gemini pro cannot be off: chat flag ignored');
b=B('google','gemini-2.5-pro',{quiet:true}); ok(b.generationConfig.thinkingConfig.thinkingBudget===128,'gemini pro quiet -> 128');
b=B('google','gemini-2.5-flash',{quiet:true}); ok(b.generationConfig.thinkingConfig.thinkingBudget===0,'gemini flash quiet -> 0');
b=B('google','gemini-3-pro',{effort:'medium'}); ok(b.generationConfig.thinkingConfig.thinkingLevel==='low'||b.generationConfig.thinkingConfig.thinkingLevel==='high','gemini 3 level');
ok(reasoningSpec('google','gemini-1.5-flash')===null,'gemini 1.5 none');
// Ollama
b=B('ollama','qwen3:8b',{think:true}); ok(b.think===true,'qwen3 think on'); b=B('ollama','qwen3:8b',{think:false}); ok(b.think===false,'qwen3 think off');
b=B('ollama','gpt-oss:20b',{effort:'high'}); ok(b.think==='high','gpt-oss level');
b=B('ollama','llama3.2:3b',{}); ok(b.think===undefined,'llama no think');
ok(modelCaps('openai','gpt-5-nano').reasoning===true&&modelCaps('openai','gpt-4o').reasoning===false,'caps flags');
b=B('openai','gpt-6-luna',{effort:'low',think:false}); ok(b.reasoning.effort==='none','gpt-6-luna off -> none');
b=B('openai','gpt-6-luna',{effort:'high'}); ok(b.reasoning.effort==='high'&&b.reasoning.summary==='auto','gpt-6-luna high');
ok(reasoningSpec('openai','gpt-4.1')===null,'gpt-4.1 none');
console.log(fails?`${fails} FAILED`:'ALL PASSED'); process.exit(fails?1:0);
