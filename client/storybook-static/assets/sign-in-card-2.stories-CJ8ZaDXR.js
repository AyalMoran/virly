import{S as L}from"./sign-in-card-2-DVJSsX6c.js";import"./iframe-DZ5yRNij.js";import"./preload-helper-C1FmrZbK.js";import"./index-D3pstTQV.js";import"./index-kMzSCBiS.js";import"./utils-DCADjnpI.js";import"./proxy-BzfIBfh9.js";import"./createLucideIcon-WwrtmSrE.js";import"./check-x2dPxJ_p.js";import"./index-CKnVyPAM.js";import"./arrow-right-CqizUNZH.js";const M={title:"Auth/SignInCard2",component:L,parameters:{layout:"centered",docs:{description:{component:"The animated auth card. Fully controlled — login mode by default; passing\n`onConfirmPasswordChange`/`onPhoneChange` switches it to register mode."}}},args:{email:"",password:"",isLoading:!1,onEmailChange:()=>{},onPasswordChange:()=>{},onRememberMeChange:()=>{},onSubmit:()=>{}}},r={},e={args:{title:"Create account",submitLabel:"Create account",footerLabel:"Sign in",footerTo:"/login",confirmPassword:"",phone:"",onConfirmPasswordChange:()=>{},onPhoneChange:()=>{}}},o={args:{email:"not-an-email",password:"short",emailError:"Enter a valid email address.",passwordError:"Password must be at least 8 characters.",formError:"We couldn't sign you in. Check your details and try again."}},a={args:{email:"test.user@virly.test",password:"correct-horse",isLoading:!0}};var s,t,n,i,d;r.parameters={...r.parameters,docs:{...(s=r.parameters)==null?void 0:s.docs,source:{originalSource:"{}",...(n=(t=r.parameters)==null?void 0:t.docs)==null?void 0:n.source},description:{story:"Sign-in mode.",...(d=(i=r.parameters)==null?void 0:i.docs)==null?void 0:d.description}}};var c,m,p,l,g;e.parameters={...e.parameters,docs:{...(c=e.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    title: "Create account",
    submitLabel: "Create account",
    footerLabel: "Sign in",
    footerTo: "/login",
    confirmPassword: "",
    phone: "",
    onConfirmPasswordChange: () => {},
    onPhoneChange: () => {}
  }
}`,...(p=(m=e.parameters)==null?void 0:m.docs)==null?void 0:p.source},description:{story:"Register mode (confirm password + phone fields appear).",...(g=(l=e.parameters)==null?void 0:l.docs)==null?void 0:g.description}}};var u,h,f,C,w;o.parameters={...o.parameters,docs:{...(u=o.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    email: "not-an-email",
    password: "short",
    emailError: "Enter a valid email address.",
    passwordError: "Password must be at least 8 characters.",
    formError: "We couldn't sign you in. Check your details and try again."
  }
}`,...(f=(h=o.parameters)==null?void 0:h.docs)==null?void 0:f.source},description:{story:"Validation + form errors surfaced.",...(w=(C=o.parameters)==null?void 0:C.docs)==null?void 0:w.description}}};var y,b,E,S,P;a.parameters={...a.parameters,docs:{...(y=a.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    email: "test.user@virly.test",
    password: "correct-horse",
    isLoading: true
  }
}`,...(E=(b=a.parameters)==null?void 0:b.docs)==null?void 0:E.source},description:{story:"Submission in flight — spinner, disabled submit.",...(P=(S=a.parameters)==null?void 0:S.docs)==null?void 0:P.description}}};const O=["Default","Register","Error","Loading"];export{r as Default,o as Error,a as Loading,e as Register,O as __namedExportsOrder,M as default};
