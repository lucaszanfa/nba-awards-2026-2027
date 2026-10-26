let engine;
self.onmessage=async ({data})=>{
  try{
    engine ||= await import('./forecast-engine.mjs');
    const models=engine.buildModels(data.input);
    self.postMessage({id:data.id,report:engine.simulate({...data,models})});
  }catch(e){self.postMessage({id:data.id,error:e.message});}
};
