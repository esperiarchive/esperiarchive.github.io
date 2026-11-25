/* Reader language codes and game-native catalogue labels. No network translation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WardrobeLocale=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const messages={};
  const rows=`
Starry sky|星空|星空|별이 빛나는 하늘
Green fields|绿野|緑の草原|푸른 들판
Golden fields|金色原野|金色の草原|황금빛 들판
Moonlit fields|月下原野|月明かりの草原|달빛 들판
Misty fields|雾中原野|霧の草原|안개 낀 들판
Hearts|爱心|ハート|하트
Fireworks|烟花|花火|불꽃놀이
Golden pattern|金色纹样|金色の模様|황금빛 문양
3D Beta|3D 测试版|3D ベータ|3D 베타
This look needs the 3D wardrobe. Start a new 2D look to edit.|此造型需要 3D 衣橱。请新建 2D 造型。|このスタイルには3D衣装室が必要です。新しい2Dスタイルを作成してください。|이 외형은 3D 옷장이 필요합니다. 새 2D 외형을 만들어 주세요.
Merlin's Wardrobe|梅林的衣橱|マーリンのワードローブ|멀린의 옷장
Preview and combine cosmetics for Merlin.|预览并搭配梅林的装扮。|マーリンの衣装をプレビューして組み合わせましょう。|멀린의 외형을 미리 보고 조합하세요.
A LOOK OF YOUR OWN|你的专属造型|自分だけのスタイル|나만의 외형
Make it yours.|打造你的造型。|自分らしいスタイルに。|나만의 스타일을 완성하세요.
Explore Esperia’s wardrobe. Find your Merlin.|探索伊索米亚的衣橱，打造你的梅林。|エスペリアの衣装から、自分だけのマーリンを。|에스페리아의 의상으로 나만의 멀린을 만나세요.
Female|女|女性|여성
Male|男|男性|남성
Reset|重置|リセット|초기화
Back|背面|背面|뒷모습
Front|正面|正面|앞모습
Back to reader|返回阅读器|リーダーに戻る|리더로 돌아가기
Save and apply|保存并应用|保存して適用|저장 후 적용
Cosmetics|外观|コスチューム|코스튬
A wardrobe item from the current game catalogue.|来自当前游戏目录的衣橱物品。|ゲーム内のワードローブアイテムです。|현재 게임 목록에 있는 옷장 아이템입니다.
Changes your character’s physique while keeping the selected wardrobe.|更改角色体型，保留当前穿搭。|選択中の衣装のまま、キャラクターの体格を変更します。|선택한 의상을 유지하면서 캐릭터의 체형을 바꿉니다.
Options|选项|オプション|옵션
Look|造型|スタイル|외형
Random|随机|ランダム|무작위
Back to the wardrobe|返回衣橱|衣装室に戻る|옷장으로 돌아가기
Background|背景|背景|배경
No other preview-ready look is available.|没有其他可预览的造型。|ほかにプレビューできるスタイルがありません。|미리 볼 수 있는 다른 외형이 없습니다.
Reset look|重置造型|スタイルをリセット|외형 초기화
Download|下载|ダウンロード|다운로드
Download image (PNG)|下载图片 (PNG)|画像をダウンロード (PNG)|이미지 다운로드 (PNG)
Download this look as a transparent PNG|将此造型下载为透明PNG|このスタイルを透過PNGでダウンロード|이 외형을 투명 PNG로 다운로드
Sort items|排序|並べ替え|정렬
ID ascending|ID升序|ID昇順|ID 오름차순
ID descending|ID降序|ID降順|ID 내림차순
Name ascending|名称升序|名前昇順|이름 오름차순
Name descending|名称降序|名前降順|이름 내림차순
All categories|全部分类|すべてのカテゴリー|모든 카테고리
Clear the search or choose a complete look.|清除搜索或选择完整造型。|検索を解除するか、完成スタイルを選んでください。|검색을 지우거나 완성된 외형을 선택하세요.
Look name|造型名称|スタイル名|외형 이름
My Merlin|我的梅林|私のマーリン|나의 멀린
REUSABLE ITEM PREVIEW|独立部件预览|個別パーツのプレビュー|개별 아이템 미리보기
COMPLETE UNITY CAPTURE|完整捕获|完成スタイル画像|완성된 외형 이미지
COMPOSED PREVIEW|组合预览|合成プレビュー|조합 미리보기
CAPTURE NEEDED|需要捕获|撮影データが必要|캡처 필요
PREVIEW-READY|可预览|プレビュー可能|미리보기 가능
Brown|棕色|茶色|갈색
Green|绿色|緑|초록색
Blue|蓝色|青|파란색
Red|红色|赤|빨간색
Yellow|黄色|黄|노란색
White|白色|白|흰색
Black|黑色|黒|검은색
Purple|紫色|紫|보라색
Pink|粉色|ピンク|분홍색
Silver|银色|銀|은색
Gold|金色|金|금색
Gray|灰色|グレー|회색
Sky blue|天蓝色|空色|하늘색
Language|语言|言語|언어
{name} is unavailable for this look.|此造型无法使用{name}。|このスタイルでは{name}を利用できません。|현재 외형에서는 {name}을 사용할 수 없습니다.
Colors for {name}|{name}的颜色|{name}の色|{name} 색상
Remove {name}|移除{name}|{name}を外す|{name} 제거
Select {name}|选择{name}|{name}を選択|{name} 선택
CURRENT LOOK|当前造型|現在のスタイル|현재 외형
PREVIEW|预览|プレビュー|미리보기
Right-drag to zoom · zoom in to pan vertically|按住右键拖动缩放 · 放大后可上下平移|右ドラッグでズーム・拡大後は上下に移動|오른쪽 드래그로 확대/축소 · 확대 후 위아래 이동
Reset view|重置视图|表示をリセット|보기 초기화
Hand on Hip|叉腰|腰に手を当てる|우쭐
Standing|站立|立つ|차렷
Thinking|思考|熟考|고민
Rage|愤怒|激昂|분노
Helpless|无奈|しょうがない|유감
Wow|艳羡|いいなぁ|부러움
Shy|害羞|恥ずかしい|부끄
Dignified|威严|威厳|위엄
Confident|自信|自信|도도
Contemplative|沉思|考え込む|명상
Delighted|愉悦|ニコニコ|자신만만
Backdrop|背景|背景|배경
Studio|工作室|スタジオ|스튜디오
Light|浅色|明るい背景|밝게
Transparency|透明|透過|투명
View|视图|表示|보기
Full body|全身|全身|전신
Portrait|肖像|ポートレート|인물
Layer order|图层顺序|レイヤー順|레이어 순서
Outfit → Cloak → Back|服装 → 披风 → 背饰|衣装 → マント → 背中|의상 → 망토 → 등 장식
Original depth|原始深度|元の奥行き|원래 깊이
Tail bases tuck beneath the cloak where it covers the outfit.|披风覆盖服装时，尾巴根部藏在披风下。|マントが衣装を覆う部分では、尻尾の付け根をマントの下に隠します。|망토가 의상을 덮는 부분에서는 꼬리 밑부분이 망토 아래로 들어갑니다.
Keep front hair over collars|前侧发束显示在衣领上方|前髪を襟の手前に表示|앞쪽 머리카락을 옷깃 위로 표시
Lighting & effects|光照与特效|照明とエフェクト|조명 및 효과
Capture lighting|原始光照|撮影時の照明|캡처 조명
Baked into portrait|已包含在肖像中|画像に適用済み|이미지에 포함됨
Rim lighting|轮廓光|リムライト|윤곽 조명
Bloom|泛光|ブルーム|블룸
Color grading|色彩分级|カラーグレーディング|색 보정
Effects use a fixed captured frame.|特效使用固定帧。|エフェクトは固定フレームです。|효과는 고정된 프레임을 사용합니다.
This capture includes the original Unity lighting and effects.|此图包含原始光照和特效。|この画像には元の照明とエフェクトが含まれています。|이 이미지에는 원래 조명과 효과가 포함되어 있습니다.
Rim lighting, bloom and grading use the capture profile. Effects are a fixed frame.|轮廓光、泛光和色彩使用捕获设置。特效为固定帧。|撮影設定のリムライト、ブルーム、色補正を使用します。エフェクトは固定フレームです。|캡처 설정의 윤곽 조명, 블룸, 색 보정을 사용합니다. 효과는 고정 프레임입니다.
Preview-ready|可预览|プレビュー可能|미리보기 가능
Capture needed|需要捕获|撮影データが必要|캡처 필요
Complete looks|完整造型|完成スタイル|완성된 외형
Outfits|服装|衣装|의상
Hair|发型|髪型|헤어
Face|脸型|顔|얼굴형
Skin|肤色|肌の色|피부
Eyes|瞳色|目の色|동공
Headwear|头饰|頭飾り|머리 장식
Hero headgear|英雄头饰|英雄頭装飾|영웅 머리 장식
Expand wardrobe|展开衣橱|ワードローブを広げる|옷장 펼치기
Masks|面饰|マスク|액세서리
Cloaks|披风|マント|망토
Back & tails|背饰与尾巴|背中・尻尾|등 장식 및 꼬리
Beards|胡子|ひげ|수염
Makeup|脸部妆容|メイク|메이크업
Body paint|身体彩绘|ペイント|보디 페인팅
Body shape|体型|体型|체형
Body build|体型|体型|체형
Type A|类型A|タイプA|타입 A
Type B|类型B|タイプB|타입 B
Wardrobe|衣橱|ワードローブ|옷장
Sort by|排序|並べ替え|정렬 기준
Name|名称|名前|이름
Ascending|升序|昇順|오름차순
Descending|降序|降順|내림차순
None|无|なし|없음
Remove this part|移除此部件|このパーツを外す|이 부위 제거
Default|默认|デフォルト|기본
Search names or avatar IDs…|搜索名称或外观ID…|名前・アバターIDを検索…|이름 또는 아바타 ID 검색…
Search wardrobe|搜索衣橱|ワードローブを検索|옷장 검색
No matching items|无匹配物品|一致するアイテムがありません|일치하는 아이템 없음
Clear the search, choose a complete look, or turn off Preview-ready to browse the full list.|清除搜索、选择完整造型，或关闭“可预览”查看全部。|検索を解除するか完成スタイルを選ぶか、「プレビュー可能」をオフにしてください。|검색을 지우거나 완성된 외형을 선택하세요. 전체 목록은 '미리보기 가능'을 끄면 볼 수 있습니다.
Refresh previews|刷新预览|プレビューを更新|미리보기 새로고침
Checking…|检查中…|確認中…|확인 중…
Previews are up to date.|预览已是最新。|プレビューは最新です。|미리보기가 최신 상태입니다.
Preview library updated. Your look is kept.|预览库已更新，当前造型已保留。|プレビューを更新しました。スタイルは保持されています。|미리보기가 업데이트되었습니다. 현재 외형은 유지됩니다.
Open recipe|打开搭配|レシピを開く|조합 열기
Save recipe|保存搭配|レシピを保存|조합 저장
Recipe opened.|搭配已打开。|レシピを開きました。|조합을 열었습니다.
Download PNG|下载PNG|PNGをダウンロード|PNG 다운로드
Portrait set|肖像集|ポートレートセット|인물 이미지 세트
Transparent images. The backdrop stays in the studio.|导出透明图片，不包含背景。|背景を含まない透過画像です。|배경을 제외한 투명 이미지입니다.
Loading catalogue…|正在加载目录…|カタログを読み込み中…|목록 불러오는 중…
The wardrobe library is unavailable|无法加载衣橱目录|ワードローブの一覧を読み込めません|옷장 목록을 불러올 수 없습니다
Reload the reader to try again.|请刷新阅读器后重试。|リーダーを再読み込みして、もう一度お試しください。|리더를 새로고침한 뒤 다시 시도하세요.
Preparing your look…|正在生成造型…|スタイルを準備中…|외형 준비 중…
Preparing the selected appearance…|正在生成所选外观…|選択した外見を準備中…|선택한 외형 준비 중…
Saving look…|正在保存造型…|スタイルを保存中…|외형 저장 중…
Look saved and applied. You can keep editing.|造型已保存并应用，可继续编辑。|スタイルを保存して適用しました。引き続き編集できます。|외형을 저장하고 적용했습니다. 계속 편집할 수 있습니다.
Preview data is missing|缺少预览数据|プレビューデータがありません|미리보기 데이터 없음
Choose a complete look|选择完整造型|完成スタイルを選択|완성된 외형 선택
Your selections are kept in the recipe. Choose Preview-ready items or a complete look to see a finished character.|选择已保存在搭配中。请选择可预览物品或完整造型。|選択内容はレシピに保持されています。プレビュー可能なアイテムか完成スタイルを選んでください。|선택한 항목은 조합에 유지됩니다. 미리보기 가능한 아이템이나 완성된 외형을 선택하세요.
Some selected parts or appearance variants need preview data. You can still save or export the recipe.|部分选择缺少预览数据，仍可保存或导出搭配。|一部の選択にプレビューデータが必要です。レシピは保存・出力できます。|일부 항목의 미리보기 데이터가 필요합니다. 조합은 저장하거나 내보낼 수 있습니다.
Assembled from reusable items · depth-aware veils and adjustable lighting.|独立部件组合 · 透明面纱与可调光照|個別パーツから合成 · 透けるベールと照明調整|개별 아이템 조합 · 투명 베일 및 조명 조절
Complete captured look · changing parts needs matching captures.|完整捕获造型 · 更换部件需要相应数据|完成スタイル画像 · パーツ変更には対応データが必要|완성된 외형 이미지 · 부위 변경 시 해당 데이터 필요
Available poses|可用姿势|使用可能なポーズ|사용 가능한 포즈
Happy|开心|喜び|기쁨
Sad|可怜|かわいそう|맴찢
Export portrait set|导出肖像集|ポートレートセットを出力|인물 이미지 세트 내보내기
The export includes poses available for this look and view.|导出包含该造型和视角可用的姿势。|このスタイルと視点で利用できるポーズを出力します。|현재 외형과 시점에서 가능한 포즈를 내보냅니다.
Download PNG set (.zip)|下载PNG集 (.zip)|PNGセットをダウンロード (.zip)|PNG 세트 다운로드 (.zip)
Download portrait pack (.json)|下载肖像包 (.json)|ポートレートパックをダウンロード (.json)|인물 이미지 팩 다운로드 (.json)
Close export options|关闭导出选项|出力設定を閉じる|내보내기 옵션 닫기
Zoom out preview|缩小预览|プレビューを縮小|미리보기 축소
Zoom in preview|放大预览|プレビューを拡大|미리보기 확대
Undo|撤销|元に戻す|실행 취소
Redo|重做|やり直す|다시 실행
Show back view|显示背面|背面を表示|뒷모습 보기
Show front view|显示正面|正面を表示|앞모습 보기
{n} items|{n}件物品|{n}個のアイテム|아이템 {n}개
{n} item|{n}件物品|{n}個のアイテム|아이템 {n}개
{n} looks|{n}个造型|{n}スタイル|외형 {n}개
{n} look|{n}个造型|{n}スタイル|외형 {n}개
{n} colors|{n}种颜色|{n}色|색상 {n}개
Season {n}|赛季{n}|シーズン{n}|시즌 {n}
Look {n}|造型{n}|スタイル{n}|외형 {n}
Preparing {pose}…|正在生成{pose}…|{pose}を準備中…|{pose} 준비 중…
Build: {name}|体型：{name}|体型：{name}|체형: {name}
`;
  for(const line of rows.trim().split('\n')){const [key,cn,jp,kr]=line.split('|');messages[key]={cn,jp,kr};}
  const language=value=>['en','cn','jp','kr'].includes(value)?value:'en';
  const patterns=Object.keys(messages).filter(key=>key.includes('{')).map(key=>({key,names:[...key.matchAll(/\{(\w+)\}/g)].map(m=>m[1]),pattern:new RegExp('^'+key.split(/(\{\w+\})/).map(part=>/^\{/.test(part)?'(.+?)':part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$')}));
  function text(value,locale='en',values={}){
    value=String(value??'');locale=language(locale);
    let key=value,params=values;
    if(!messages[key])for(const row of patterns){const match=value.match(row.pattern);if(match){key=row.key;params=Object.fromEntries(row.names.map((name,i)=>[name,match[i+1]]));break;}}
    const translated=(messages[key]?.[locale]||key).replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(params,name)?text(params[name],locale):match);
    if(translated!==value)return translated;
    if(value.includes(' · '))return value.split(' · ').map(part=>text(part,locale)).join(' · ');
    return value;
  }
  function label(item,gender,locale='en'){return item?.genders?.[gender]?.names?.[locale]||item?.names?.[locale]||item?.genders?.[gender]?.name||item?.name||'';}
  function description(item,locale='en'){
    return item.descriptions?.[locale] || item.description || text(item.slot==='bodyshape'
      ? 'Changes your character’s physique while keeping the selected wardrobe.'
      : 'A wardrobe item from the current game catalogue.',locale);
  }
  function observe(document,getLanguage){
    const remembered=new WeakMap();
    function translate(node,attribute){
      const value=attribute?node.getAttribute(attribute):node.nodeValue;if(!value?.trim())return;
      let entries=remembered.get(node);if(!entries){entries={};remembered.set(node,entries);}
      const key=attribute||'text',previous=entries[key],original=previous?.translated===value?previous.original:value;
      const translated=original.replace(/\S[\s\S]*\S|\S/,part=>text(part,getLanguage()));entries[key]={original,translated};
      if(translated!==value){if(attribute)node.setAttribute(attribute,translated);else node.nodeValue=translated;}
    }
    function apply(root=document.body){
      if(root.nodeType===3){translate(root);return;}
      if(root.nodeType!==1)return;
      const walker=document.createTreeWalker(root,4);let node;
      while((node=walker.nextNode()))if(!node.parentElement.closest('script,style,textarea,.item-name,#look-title,.selection-chip button,.appearance-user-name'))translate(node);
      for(const el of [root,...root.querySelectorAll('[placeholder],[aria-label],[title]')])for(const attr of ['placeholder','aria-label','title'])translate(el,attr);
    }
    let frame=0;const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;apply();});});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
    apply();return ()=>apply();
  }
  function bindItemTypography(grid,readerRoot){
    const nameMeasure=document.createElement('canvas').getContext('2d');
    // The reader's font-size setting, as a multiplier (1 outside the reader).
    function textScale(){return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wardrobe-text'))||1;}
    function fitItemNames(){
      const scale=textScale(),maximum=12*scale,minimum=9*scale;
      const updates=Array.from(grid.querySelectorAll('.item-name'),label=>{
        const style=getComputedStyle(label);
        const available=label.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-1;
        if(available<=0)return null;
        const text=label.textContent,spacing=parseFloat(style.letterSpacing)||0;
        const measure=size=>{
          nameMeasure.font=`${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
          return nameMeasure.measureText(text).width+Math.max(0,Array.from(text).length-1)*spacing;
        };
        const width=measure(maximum);
        const size=Math.max(minimum,Math.min(maximum,Math.floor(maximum*available/Math.max(1,width)*10)/10));
        return {label,size,singleLine:measure(size)<=available};
      });
      // Read widths together before writing sizes, avoiding a layout per card.
      for(const update of updates){if(!update)continue;
        update.label.style.fontSize=update.size+'px';
        update.label.style.whiteSpace=update.singleLine?'nowrap':'normal';
      }
    }
    let namesWidth=0;
    new ResizeObserver(entries=>{
      const width=entries[0]?.contentRect.width||0;
      if(Math.abs(width-namesWidth)>.5){namesWidth=width;fitItemNames();}
    }).observe(grid);
    document.fonts?.ready.then(fitItemNames);
    document.fonts?.addEventListener('loadingdone',fitItemNames);
    if(readerRoot){
      const followText=()=>{
        const ratio=parseFloat(getComputedStyle(readerRoot).getPropertyValue('--reader-font-ratio'))||1;
        const scale=String(Math.min(1.4,Math.max(.85,ratio)));
        if(document.documentElement.style.getPropertyValue('--wardrobe-text')===scale)return;
        document.documentElement.style.setProperty('--wardrobe-text',scale);
        fitItemNames();
      };
      new MutationObserver(followText).observe(readerRoot,{attributes:true,attributeFilter:['style']});followText();
    }
    return fitItemNames;
  }
  return {messages,language,text,label,description,observe,bindItemTypography};
});
