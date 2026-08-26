// Keep question copy clean: remove hard bracket-style task labels such as “【5 秒选】”.
// The actual question wording and answer options are left untouched.
(function(){
  const strip=text=>typeof text==='string'?text.replace(/^(?:\s*【[^】]{1,40}】\s*)+/u,'').trimStart():text;
  const cleanItem=item=>{
    if(Array.isArray(item)){
      if(item.length&&typeof item[0]==='string')item[0]=strip(item[0]);
      return item;
    }
    return strip(item);
  };
  QUIZZES.forEach(q=>{
    if(Array.isArray(q.questions))q.questions.forEach(cleanItem);
    if(Array.isArray(q.bankQuestions))q.bankQuestions.forEach(cleanItem);
  });
})();
