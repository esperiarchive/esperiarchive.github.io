// Reader codes and shared wardrobe vocabulary come from avatar_creator/locale.js.
const StudioLocale = (() => {
  const rows = `
3D Beta|3D 测试版|3D ベータ|3D 베타
2D version|2D 版|2D版|2D 버전
Start a new 2D look|新建 2D 造型|新しい2Dスタイルを作る|새 2D 외형 만들기
Retry|重试|再試行|다시 시도
3D preview unavailable|3D 预览不可用|3Dプレビューを利用できません|3D 미리보기를 사용할 수 없습니다
Graphics context lost. Recovering preview…|图形连接已中断，正在恢复预览…|描画が中断されました。復旧中…|그래픽 연결이 끊어져 미리보기를 복구하는 중입니다…
Could not load the selected look|无法加载所选造型|選んだスタイルを読み込めません|선택한 외형을 불러올 수 없습니다
This item or preset is unavailable|此外观或预设不可用|このアイテムまたはプリセットは利用できません|이 아이템 또는 프리셋을 사용할 수 없습니다
Could not save this look|无法保存造型|スタイルを保存できません|외형을 저장할 수 없습니다
This look exceeds the portrait-pack size limit.|造型超过肖像包大小限制。|肖像パックの容量を超えています。|초상화 팩의 크기 제한을 초과했습니다.
Drag to rotate · right-drag up or down to pan · scroll to zoom|拖动旋转 · 按住右键上下拖动平移 · 滚动缩放|ドラッグで回転・右ドラッグで上下移動・スクロールでズーム|드래그로 회전 · 오른쪽 버튼으로 위아래 이동 · 스크롤로 확대/축소
3D character preview|3D 角色预览|3Dキャラクタープレビュー|3D 캐릭터 미리보기
Character preview|角色预览|キャラクタープレビュー|캐릭터 미리보기
Gender|性别|性別|성별
View|视图|表示|보기
View angle (degrees)|查看角度（度）|表示角度（度）|보기 각도 (도)
Pose|姿势|ポーズ|포즈
Categories|分类|カテゴリー|분류
Turntable|自动旋转|自動回転|자동 회전
Back to categories|返回分类|カテゴリーに戻る|분류로 돌아가기
Version|款式|バージョン|버전
Experimental|实验性|試験機能|실험 기능
Light follows view|光照随视角旋转|視点に光を追従|시점에 맞춰 조명 회전
Fill hidden legs|补全隐藏的腿部|隠れた脚を補完|가려진 다리 보완
Hair collision|发型防穿模|髪の干渉を補正|머리카락 겹침 보정
Keep layers apart|防止衣物重叠|衣装の重なりを補正|옷 겹침 보정
Wow leg fit|艳羡姿势腿部修正|いいなぁポーズの脚補正|부러움 포즈 다리 보정
Dark|深色|暗色|어둡게
Transparent|透明|透明|투명
Other gender's outfits|另一性别的服装|別の性別の衣装|다른 성별 의상
The outfit version determines the body and poses.|服装款式决定体型和姿势。|衣装のバージョンで体型とポーズが決まります。|의상 버전에 따라 체형과 포즈가 결정됩니다.
Original|原始|オリジナル|기본
Loading…|加载中…|読み込み中…|불러오는 중…
3D uses capture lighting.|3D 使用拍摄光照。|3Dでは撮影時の照明を使います。|3D에서는 촬영 조명을 사용합니다.
`;
  for (const line of rows.trim().split('\n')) {
    const [key, cn, jp, kr] = line.split('|');
    WardrobeLocale.messages[key] = {cn, jp, kr};
  }
  return WardrobeLocale;
})();
