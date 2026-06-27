import{c as s}from"./createLucideIcon-WwrtmSrE.js";import{r as h,j as e}from"./iframe-DZ5yRNij.js";import{N as b}from"./index-D3pstTQV.js";import{c as x}from"./utils-DCADjnpI.js";import{m as n}from"./proxy-BzfIBfh9.js";/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],N=s("chevron-right",g);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],I=s("credit-card",k);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]],F=s("layout-dashboard",j);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"m16 17 5-5-5-5",key:"1bji2h"}],["path",{d:"M21 12H9",key:"dn1m92"}],["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}]],O=s("log-out",_);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],C=s("panel-left-close",w);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m14 9 3 3-3 3",key:"8010ee"}]],R=s("panel-left-open",q);/**
 * @license lucide-react v1.16.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],V=s("settings",T),S=8;function L(t){const o=h.useRef(null);return h.useLayoutEffect(()=>{const a=o.current;if(!a)return;const r=()=>{a.style.fontSize="";const{scrollWidth:p,clientWidth:d}=a;if(p>d&&d>0){const m=parseFloat(getComputedStyle(a).fontSize),f=Math.max(m*(d/p),S);a.style.fontSize=`${f}px`}};r();const l=new ResizeObserver(r);return l.observe(a.parentElement??a),()=>l.disconnect()},[t]),o}const $={hidden:{opacity:0},visible:{opacity:1,transition:{staggerChildren:.08}}},c={hidden:{opacity:0,x:-20},visible:{opacity:1,x:0,transition:{type:"spring",stiffness:100,damping:15}}},v=h.forwardRef(({user:t,navItems:o,logoutItem:a,collapsed:r=!1,onToggleCollapse:l,className:p},d)=>{const m=L(t.email),f=o.filter(i=>!i.pinToBottom),u=o.filter(i=>i.pinToBottom),y=i=>e.jsxs(h.Fragment,{children:[i.isSeparator?e.jsx(n.div,{variants:c,className:"profile-sidebar-gap"}):null,e.jsx(n.div,{variants:c,children:e.jsxs(b,{to:i.href,className:"profile-sidebar-link","aria-label":i.label,title:r?i.label:void 0,children:[e.jsx("span",{className:"profile-sidebar-icon",children:i.icon}),e.jsx("span",{className:"profile-sidebar-label",children:i.label}),e.jsx(N,{className:"profile-sidebar-chevron","aria-hidden":"true"})]})})]},i.href);return e.jsxs(n.aside,{ref:d,className:x("profile-sidebar",r&&"collapsed",p),initial:"hidden",animate:"visible",variants:$,"aria-label":"User profile menu",children:[e.jsxs(n.div,{variants:c,className:"profile-sidebar-user",children:[e.jsx("img",{src:t.avatarUrl,alt:`${t.name}'s avatar`,className:"profile-sidebar-avatar"}),e.jsxs("div",{className:"profile-sidebar-identity",children:[e.jsx("span",{children:t.name}),e.jsx("small",{ref:m,children:t.email})]}),l?e.jsx("button",{type:"button",className:"profile-sidebar-toggle",onClick:l,"aria-expanded":!r,"aria-controls":"profile-sidebar-nav","aria-label":r?"Expand navigation":"Collapse navigation",title:r?"Expand navigation":"Collapse navigation",children:r?e.jsx(R,{"aria-hidden":"true"}):e.jsx(C,{"aria-hidden":"true"})}):null]}),e.jsx(n.div,{variants:c,className:"profile-sidebar-divider"}),e.jsxs("nav",{id:"profile-sidebar-nav",className:"profile-sidebar-nav",role:"navigation",children:[f.map(y),u.length?e.jsx("div",{className:"profile-sidebar-spacer","aria-hidden":"true"}):null,u.map(y)]}),e.jsx(n.div,{variants:c,className:"profile-sidebar-footer",children:e.jsxs("button",{type:"button",onClick:a.onClick,className:"profile-sidebar-logout","aria-label":a.label,title:r?a.label:void 0,children:[e.jsx("span",{className:"profile-sidebar-icon",children:a.icon}),e.jsx("span",{className:"profile-sidebar-label",children:a.label})]})})]})});v.displayName="UserProfileSidebar";v.__docgenInfo={description:"",methods:[],displayName:"UserProfileSidebar",props:{user:{required:!0,tsType:{name:"UserProfile"},description:""},navItems:{required:!0,tsType:{name:"Array",elements:[{name:"NavItem"}],raw:"NavItem[]"},description:""},logoutItem:{required:!0,tsType:{name:"signature",type:"object",raw:`{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}`,signature:{properties:[{key:"icon",value:{name:"ReactReactNode",raw:"React.ReactNode",required:!0}},{key:"label",value:{name:"string",required:!0}},{key:"onClick",value:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}},required:!0}}]}},description:""},collapsed:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}},onToggleCollapse:{required:!1,tsType:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}}},description:""},className:{required:!1,tsType:{name:"string"},description:""}}};export{I as C,O as L,V as S,v as U,F as a};
