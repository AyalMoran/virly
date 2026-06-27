import{F as g,j as o}from"./iframe-DZ5yRNij.js";import{U as j}from"./UserProfileHeader-DXrnZ3HK.js";import"./preload-helper-C1FmrZbK.js";import"./Primitives-DzJ49MJc.js";import"./createLucideIcon-WwrtmSrE.js";import"./user-avatar-_R2f97eP.js";import"./badge-check-oIYDNVNe.js";import"./send-BfpXNUG5.js";const H={title:"Shared UI/UserProfileHeader",component:j,parameters:{layout:"padded"},decorators:[h=>o.jsx("div",{style:{maxWidth:560,width:"100%"},children:o.jsx(h,{})})],args:{user:g,isSelf:!1,canSendMoney:!0,onSendMoney:()=>{}}},e={},r={args:{user:{...g,isVerified:!1}}},s={args:{isSelf:!0,canSendMoney:!1}};var a,t,i,n,c;e.parameters={...e.parameters,docs:{...(a=e.parameters)==null?void 0:a.docs,source:{originalSource:"{}",...(i=(t=e.parameters)==null?void 0:t.docs)==null?void 0:i.source},description:{story:"Verified counterparty you can transfer to.",...(c=(n=e.parameters)==null?void 0:n.docs)==null?void 0:c.description}}};var d,p,m,u,f;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    user: {
      ...publicUserFixture,
      isVerified: false
    }
  }
}`,...(m=(p=r.parameters)==null?void 0:p.docs)==null?void 0:m.source},description:{story:"Unverified counterparty.",...(f=(u=r.parameters)==null?void 0:u.docs)==null?void 0:f.description}}};var l,S,y,x,U;s.parameters={...s.parameters,docs:{...(l=s.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    isSelf: true,
    canSendMoney: false
  }
}`,...(y=(S=s.parameters)==null?void 0:S.docs)==null?void 0:y.source},description:{story:"Your own profile — no transfer action.",...(U=(x=s.parameters)==null?void 0:x.docs)==null?void 0:U.description}}};const P=["Default","Unverified","Self"];export{e as Default,s as Self,r as Unverified,P as __namedExportsOrder,H as default};
