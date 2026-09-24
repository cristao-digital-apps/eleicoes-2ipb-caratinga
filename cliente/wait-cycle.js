export function createWaitCycle({onElapsed,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
 let timer=null;
 function stop(){if(timer!==null){clearIntervalFn(timer);timer=null;}}
 function prepare(seconds,onTick){
  stop();
  let remaining=seconds;
  onTick(remaining);
  return ()=>{
   if(timer!==null)return;
   timer=setIntervalFn(()=>{
    remaining--;
    onTick(remaining);
    if(remaining<=0){stop();onElapsed();}
   },1000);
  };
 }
 return {prepare,stop,get running(){return timer!==null;}};
}
