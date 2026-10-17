import React, {useEffect,useRef} from 'react';

// The Neynar write authorization widget requests explicit permission from the
// Farcaster user. Simcaster validates the returned signer on its own backend
// before saving it; never publish with a signer returned only by the browser.
export default function NeynarWriteConnect({clientId,onAuthorized,onError}){
  const callbacks=useRef({onAuthorized,onError});
  callbacks.current={onAuthorized,onError};
  useEffect(()=>{
    if(!clientId)return;
    const callbackName='simcasterNeynarWriteApproved';
    const prior=window[callbackName];
    window[callbackName]=async data=>{
      try{await callbacks.current.onAuthorized(data);}
      catch(error){callbacks.current.onError?.(error);}
    };
    const script=document.createElement('script');
    script.src='https://neynarxyz.github.io/siwn/raw/1.2.0/index.js';
    script.async=true;
    script.id='simcaster-neynar-authorize-script';
    script.onerror=()=>callbacks.current.onError?.(new Error('Unable to load Neynar authorization. Please retry.'));
    document.body.appendChild(script);
    return ()=>{
      script.remove();
      if(prior===undefined)delete window[callbackName];
      else window[callbackName]=prior;
    };
  },[clientId]);
  if(!clientId)return null;
  return <div className="neynar-write-container">
    <div className="neynar_signin" data-client_id={clientId} data-success-callback="simcasterNeynarWriteApproved"/>
    <small>Authorize Simcaster with Farcaster to like, reply and recast. You can revoke access in your Farcaster app.</small>
  </div>;
}
