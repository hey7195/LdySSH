import{r,j as e}from"./react-vendor-DrROGObh.js";import{F as k,h as T,G as E,X as P,C as j,B as D,S as F}from"./icons-C519BDPr.js";const l=[{name:"Nginx 反向代理配置 (Nginx Config)",path:"/etc/nginx/sites-available/default",content:`server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}`},{name:"Docker Compose Stack (docker-compose.yml)",path:"/opt/app/docker-compose.yml",content:`version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html
    restart: always

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass securepassword
    ports:
      - "6379:6379"
    restart: always`},{name:"Systemd 服务配置 (service.unit)",path:"/etc/systemd/system/my-app.service",content:`[Unit]
Description=My Custom Production App Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/my-app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target`},{name:"Linux Kernel sysctl 参数调优",path:"/etc/sysctl.conf",content:`# Linux Network & Kernel Performance Tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
fs.file-max = 2097152`}],R=({isOpen:v,onClose:a,initialFilePath:y="/etc/nginx/nginx.conf",initialContent:c="",onSaveToRemote:d})=>{const[o,x]=r.useState(y),[w,N]=r.useState(c||l[0].content),[n,p]=r.useState(c||l[0].content),[i,m]=r.useState("editor"),[z,h]=r.useState(!1),[f,u]=r.useState(!1);if(!v)return null;const _=t=>{x(t.path),N(t.content),p(t.content)},S=()=>{d&&d(o,n),h(!0),setTimeout(()=>h(!1),2500)},C=()=>{navigator.clipboard.writeText(n),u(!0),setTimeout(()=>u(!1),2e3)},b=w.split(`
`),g=n.split(`
`);return e.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none",onClick:a,children:e.jsxs("div",{className:"flex w-full max-w-6xl h-[88vh] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3.5",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-md",children:e.jsx(k,{className:"h-5 w-5"})}),e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-extrabold text-zinc-100 flex items-center gap-2",children:[e.jsx("span",{children:"SFTP 深度远程代码编辑器 & File Diff 对比器"}),e.jsx("span",{className:"rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 font-mono text-[10px] text-purple-400 font-bold",children:"Deep Remote IDE"})]}),e.jsx("p",{className:"text-xs text-zinc-400",children:"支持多文件实时编辑、SFTP 云端同步保存及代码变更 (Diff) 逐行对比"})]})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("div",{className:"flex items-center rounded-xl border border-zinc-800 bg-zinc-900 p-1",children:[e.jsxs("button",{type:"button",onClick:()=>m("editor"),className:`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${i==="editor"?"bg-purple-600 text-white shadow-md shadow-purple-600/20":"text-zinc-400 hover:text-zinc-200"}`,children:[e.jsx(T,{className:"h-3.5 w-3.5"}),e.jsx("span",{children:"代码编辑"})]}),e.jsxs("button",{type:"button",onClick:()=>m("diff"),className:`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${i==="diff"?"bg-purple-600 text-white shadow-md shadow-purple-600/20":"text-zinc-400 hover:text-zinc-200"}`,children:[e.jsx(E,{className:"h-3.5 w-3.5"}),e.jsx("span",{children:"Diff 对比"})]})]}),e.jsx("button",{type:"button",onClick:a,className:"rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer",children:e.jsx(P,{className:"h-4 w-4"})})]})]}),e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/40 px-6 py-2.5",children:[e.jsxs("div",{className:"flex items-center gap-2 flex-1 min-w-[300px]",children:[e.jsx("span",{className:"text-xs font-bold text-zinc-400",children:"远程路径:"}),e.jsx("input",{type:"text",value:o,onChange:t=>x(t.target.value),className:"flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-purple-300 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-xs font-bold text-zinc-400",children:"常用模版:"}),e.jsx("div",{className:"flex items-center gap-1.5",children:l.map((t,s)=>e.jsx("button",{type:"button",onClick:()=>_(t),className:"rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-zinc-300 hover:border-purple-500/50 hover:text-purple-300 transition-all cursor-pointer",children:t.name.split(" ")[0]},s))})]})]}),e.jsx("div",{className:"flex-1 overflow-hidden p-4",children:i==="editor"?e.jsxs("div",{className:"flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner",children:[e.jsxs("div",{className:"flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/50 px-4 py-2 text-xs font-mono text-zinc-400",children:[e.jsxs("span",{children:[o," (",n.split(`
`).length," 行, ",n.length," 字节)"]}),e.jsx("span",{className:"text-purple-400 font-bold",children:"SFTP Direct Edit Mode"})]}),e.jsx("textarea",{value:n,onChange:t=>p(t.target.value),className:"flex-1 resize-none bg-zinc-950 p-4 font-mono text-xs text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none scrollbar-thin",placeholder:"在此输入或粘贴代码内容..."})]}):e.jsxs("div",{className:"grid h-full grid-cols-2 gap-3 overflow-hidden",children:[e.jsxs("div",{className:"flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner",children:[e.jsxs("div",{className:"border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-mono font-bold text-rose-400 flex items-center justify-between",children:[e.jsx("span",{children:"- 原始版本 (Original)"}),e.jsxs("span",{className:"text-[10px] text-zinc-500",children:[b.length," 行"]})]}),e.jsx("div",{className:"flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-400 bg-rose-950/10",children:b.map((t,s)=>e.jsxs("div",{className:"flex gap-3 hover:bg-rose-500/10 px-1 py-0.5 rounded",children:[e.jsx("span",{className:"w-8 select-none text-right text-zinc-600 shrink-0",children:s+1}),e.jsx("pre",{className:"whitespace-pre-wrap font-mono text-zinc-300",children:t})]},s))})]}),e.jsxs("div",{className:"flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner",children:[e.jsxs("div",{className:"border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs font-mono font-bold text-emerald-400 flex items-center justify-between",children:[e.jsx("span",{children:"+ 当前修改版本 (Modified)"}),e.jsxs("span",{className:"text-[10px] text-zinc-500",children:[g.length," 行"]})]}),e.jsx("div",{className:"flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-200 bg-emerald-950/10",children:g.map((t,s)=>e.jsxs("div",{className:"flex gap-3 hover:bg-emerald-500/10 px-1 py-0.5 rounded",children:[e.jsx("span",{className:"w-8 select-none text-right text-zinc-600 shrink-0",children:s+1}),e.jsx("pre",{className:"whitespace-pre-wrap font-mono text-emerald-300",children:t})]},s))})]})]})}),e.jsxs("div",{className:"flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-6 py-3",children:[e.jsx("div",{className:"flex items-center gap-2 text-xs text-zinc-400",children:z?e.jsxs("span",{className:"flex items-center gap-1.5 font-bold text-emerald-400 animate-fade-in",children:[e.jsx(j,{className:"h-4 w-4"})," 已通过 SFTP 安全上传并同步回远程服务器！"]}):e.jsx("span",{children:"快捷键: Ctrl+S 保存上传 | 支持 Nginx, Docker, Systemd 模板"})}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{type:"button",onClick:C,className:"flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer",children:[f?e.jsx(j,{className:"h-3.5 w-3.5 text-emerald-400"}):e.jsx(D,{className:"h-3.5 w-3.5"}),e.jsx("span",{children:f?"已复制":"复制代码"})]}),e.jsxs("button",{type:"button",onClick:S,className:"flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95",children:[e.jsx(F,{className:"h-3.5 w-3.5"}),e.jsx("span",{children:"SFTP 保存并同步至远程"})]})]})]})]})})};export{R as IntegratedCodeDiffEditorModal};
