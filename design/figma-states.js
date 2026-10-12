if(P.children.some(n=>n.name==='04 · 连接与异常状态'))throw Error('States already exist');
const screen=stack('04 · 连接与异常状态',1500,780,'canvas',32,24);screen.x=100;screen.y=2500;
add(screen,text('连接与执行反馈','title'),text('接入层独立配置；失败恢复围绕已完成步骤，避免重复创建外部资源。','body','muted'));
const connections=row('连接规划',1436,204,null,0,16);
for(const [title,state,key,desc,action]of [['GitHub','首版接入','running','绑定个人仓库，关联 Issue、PR\n和检查结果。','配置 GitHub'],['公司 CODING','适配器预留','neutral','在公司环境设置服务地址，\n校验认证方式与平台能力。','配置 CODING'],['DeepSeek Harness','本机已发现','success','CLI 支持 headless 与 JSON 事件。\n运行连通性与事件字段待验证。','检查本机执行器']]){const c=border(stack(title,468,204,'surface',20,12));const h=row(title,428,28);add(h,text(title,'section'));spacer(h);add(h,badge(state,key,112));add(c,h,text(desc,'body','muted',428),button(action,'secondary',180));add(connections,c);}add(screen,connections);
add(screen,text('状态与恢复动作','section'));const states=row('交互状态',1436,244,null,0,16);
for(const [title,status,key,desc,cta]of [['尚未绑定仓库','空状态','neutral','添加第一个仓库，才能关联代码产物。项目需求仍可先行整理。','绑定仓库'],['正在执行检查','执行中','running','步骤 3 / 4：运行自动检查。持续显示最近事件，允许取消任务。','取消执行'],['等待人工评审','需处理','waiting','代码已提交，检查通过。由负责人确认评审结果与验收标准。','打开工作项'],['状态回写失败','可恢复','failed','PR 已创建成功。检查连接后，仅重试状态回写，保留已有产物。','重试失败步骤']]){const c=border(stack(title,347,244,'surface',20,12));add(c,badge(status,key,100),text(title,'section'),text(desc,'body','muted',307));const sp=box('间距','VERTICAL',1,1);add(c,sp);sp.layoutSizingVertical='FILL';add(c,button(cta,key==='running'?'secondary':'primary',160,title==='等待人工评审'?'detail':undefined));add(states,c);}add(screen,states);
add(screen,text('连接卡为规划状态：未请求 GitHub 授权、未连接公司平台、未运行 AI 任务。','small','muted'));
return evidence(screen);
