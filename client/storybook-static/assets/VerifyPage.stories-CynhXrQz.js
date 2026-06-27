import{L as F,c as U,r as o,j as e,O as L,w as q,P as N,Q as C}from"./iframe-DZ5yRNij.js";import{u as I,L as M}from"./index-D3pstTQV.js";import{b as Q,a as $}from"./Primitives-DzJ49MJc.js";import{m as y,a as g}from"./route-transition-DJq0fy5I.js";import{P as z}from"./PersonalDetailsAuthForm-DmqUiJrw.js";import{A as G}from"./AuthLayout-B7SrXR19.js";import{A as J}from"./index-CKnVyPAM.js";import{m as K}from"./proxy-BzfIBfh9.js";import{d as W}from"./delay-tbEf_91R.js";import"./preload-helper-C1FmrZbK.js";import"./index-kMzSCBiS.js";import"./createLucideIcon-WwrtmSrE.js";import"./validation-BebyThp4.js";import"./arrow-right-CqizUNZH.js";import"./user-round-KKghLVv1.js";import"./animated-text-C45JbJfK.js";import"./utils-DCADjnpI.js";const X=1e3;function _(){const m=F(),c=U(),[p]=I(),[i,u]=o.useState(""),[d,O]=o.useState(!1),[a,f]=o.useState("verify");o.useEffect(()=>{const h=p.get("token");if(!h){u("Verification token is missing.");return}let l=!0;return m.verify(h).then(n=>{if(l){if(n.needsPersonalDetails){f("personalDetails");return}O(!0),window.setTimeout(()=>{y(),c("/dashboard",{replace:!0,state:g})},700)}}).catch(n=>{l&&u(n instanceof Error?n.message:"Verification failed.")}),()=>{l=!1}},[m,c,p]);function B(){f("leaving"),window.setTimeout(()=>{y(),c("/dashboard",{replace:!0,state:g})},X)}return e.jsx(G,{title:"Verify email",subtitle:"",visualText:"Virly",barePanel:a==="personalDetails",isExiting:a==="leaving",children:e.jsx(J,{mode:"wait",children:a==="verify"?e.jsxs(K.div,{className:"form-stack",initial:{opacity:1},animate:{opacity:1},exit:{opacity:0,y:-18,scale:.98},transition:{duration:.35},children:[d?e.jsx(Q,{message:"Email verified. Opening dashboard..."}):null,i?e.jsx($,{message:i}):null,!d&&!i?e.jsx("div",{className:"spinner-panel",children:"Checking token..."}):null,i?e.jsx(M,{className:"button button-primary",to:"/resend-verification",children:"Resend verification"}):null]},"verify"):a==="personalDetails"?e.jsx(z,{onComplete:B},"personal-details"):null})})}_.__docgenInfo={description:"",methods:[],displayName:"VerifyPage"};const he={title:"Auth/VerifyPage",component:_,parameters:{layout:"fullscreen",docs:{description:{component:`Email-verification landing page. The token is read from the URL, so each
 story sets an initial route entry.`}}},decorators:[q]},t={parameters:{router:{initialEntries:["/verify"]}}},r={parameters:{router:{initialEntries:["/verify?token=storybook-token"]},msw:{handlers:[N.get("*/api/auth/verify",async()=>(await W("infinite"),C.json({user:null}))),...L]}}},s={parameters:{router:{initialEntries:["/verify?token=expired-token"]},msw:{handlers:[N.get("*/api/auth/verify",()=>C.json({message:"This verification link has expired."},{status:400})),...L]}}};var k,v,x,E,j;t.parameters={...t.parameters,docs:{...(k=t.parameters)==null?void 0:k.docs,source:{originalSource:`{
  parameters: {
    router: {
      initialEntries: ["/verify"]
    }
  }
}`,...(x=(v=t.parameters)==null?void 0:v.docs)==null?void 0:x.source},description:{story:'No token in the URL — the "token is missing" error + resend link.',...(j=(E=t.parameters)==null?void 0:E.docs)==null?void 0:j.description}}};var w,P,b,A,S;r.parameters={...r.parameters,docs:{...(w=r.parameters)==null?void 0:w.docs,source:{originalSource:`{
  parameters: {
    router: {
      initialEntries: ["/verify?token=storybook-token"]
    },
    msw: {
      handlers: [http.get("*/api/auth/verify", async () => {
        await delay("infinite");
        return HttpResponse.json({
          user: null
        });
      }), ...defaultHandlers]
    }
  }
}`,...(b=(P=r.parameters)==null?void 0:P.docs)==null?void 0:b.source},description:{story:'A token is present and the verify request is in flight — "Checking token…".',...(S=(A=r.parameters)==null?void 0:A.docs)==null?void 0:S.description}}};var T,D,V,R,H;s.parameters={...s.parameters,docs:{...(T=s.parameters)==null?void 0:T.docs,source:{originalSource:`{
  parameters: {
    router: {
      initialEntries: ["/verify?token=expired-token"]
    },
    msw: {
      handlers: [http.get("*/api/auth/verify", () => HttpResponse.json({
        message: "This verification link has expired."
      }, {
        status: 400
      })), ...defaultHandlers]
    }
  }
}`,...(V=(D=s.parameters)==null?void 0:D.docs)==null?void 0:V.source},description:{story:"The token is invalid/expired — verification error + resend link.",...(H=(R=s.parameters)==null?void 0:R.docs)==null?void 0:H.description}}};const ye=["Default","Checking","Error"];export{r as Checking,t as Default,s as Error,ye as __namedExportsOrder,he as default};
