// ========================================
// تحميل الداتاسيت
// ========================================

let lawDataset = [];

async function loadDataset() {
    try {
        const response = await fetch('labor_law_cleaned.json');
        lawDataset = await response.json();
        console.log('✅ تم تحميل الداتاسيت:', lawDataset.length, 'مادة');
    } catch (error) {
        console.error('❌ خطأ في تحميل الداتاسيت:', error);
        alert('لم نتمكن من تحميل البيانات');
    }
}

loadDataset();

// ========================================
// RAG - البحث الذكي في الداتاسيت
// ========================================

/**
 * يبحث في الداتاسيت المحلي ويرجع أكثر المواد صلة بالسؤال
 * بدل إرسال 245 مادة لنهى، نرسل فقط 6-8 مواد ذات صلة
 * هذا يزيد الدقة ويقلل وقت الاستجابة
 */
function retrieveRelevantArticles(query, topK = 7) {
    // تنظيف الاستعلام
    const cleanQuery = query.replace(/[؟?.,،]/g, ' ').trim();
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);

    // كلمات يتجاهلها البحث (stop words عربية)
    const stopWords = new Set([
        'من', 'في', 'على', 'إلى', 'عن', 'مع', 'هل', 'ما', 'هو', 'هي',
        'أن', 'إن', 'كان', 'يكون', 'لكن', 'لو', 'إذا', 'عند', 'بعد',
        'قبل', 'كيف', 'لماذا', 'متى', 'أين', 'التي', 'الذي', 'التي',
        'وما', 'وهو', 'وهي', 'ولا', 'وأن', 'ولم', 'لم', 'لن', 'ليس'
    ]);

    // فلترة كلمات البحث
    const keywords = queryWords.filter(w => !stopWords.has(w));

    // حساب درجة التطابق لكل مادة
    const scored = lawDataset.map(article => {
        const text = article.text.toLowerCase();
        let score = 0;

        keywords.forEach(keyword => {
            // تطابق تام = 3 نقاط
            if (text.includes(keyword)) score += 3;

            // تطابق جزئي = 1 نقطة (جذر الكلمة)
            if (keyword.length > 4) {
                const root = keyword.substring(0, Math.floor(keyword.length * 0.7));
                if (text.includes(root)) score += 1;
            }
        });

        return { article, score };
    });

    // ترتيب حسب الدرجة وإرجاع أعلى النتائج
    return scored
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => item.article);
}

// ========================================
// التبديل بين طرق شرح المادة
// ========================================

function selectMethod(method) {
    document.querySelectorAll('.method-option').forEach(option => {
        option.classList.remove('active');
    });
    event.target.closest('.method-option').classList.add('active');

    if (method === 'description') {
        document.getElementById('descriptionMethod').classList.add('active');
        document.getElementById('numberMethod').classList.remove('active');
    } else {
        document.getElementById('descriptionMethod').classList.remove('active');
        document.getElementById('numberMethod').classList.add('active');
    }
}

// ========================================
// Floating Updates Widget
// ========================================

function toggleUpdates() {
    const panel = document.getElementById('updatesPanel');
    panel.classList.toggle('active');
}

// ========================================
// التبديل بين التبويبات
// ========================================

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');
}

// ========================================
// الاتصال بالـ Backend
// ========================================

async function callAPI(systemPrompt, userPrompt) {
    try {
        console.log('🔄 إرسال طلب للـ Backend...');

        const response = await fetch('https://bayn-production.up.railway.app/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ خطأ من Backend:', errorData);
            throw new Error(errorData.error || 'فشل الاتصال بالسيرفر');
        }

        const data = await response.json();
        console.log('✅ تم استقبال الجواب');

        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        } else if (data.content && data.content[0] && data.content[0].text) {
            return data.content[0].text;
        } else if (data.response) {
            return data.response;
        } else {
            console.error('⚠️ تنسيق غير متوقع:', data);
            throw new Error('تنسيق الجواب غير متوقع');
        }

    } catch (error) {
        console.error('❌ خطأ:', error);
        throw error;
    }
}

// ========================================
// 1. البحث في الأنظمة (مع RAG)
// ========================================

async function searchLaw() {
    const searchInput = document.getElementById('searchInput').value.trim();
    const loadingDiv = document.getElementById('searchLoading');
    const resultDiv = document.getElementById('searchResult');

    if (!searchInput) {
        alert('الرجاء كتابة سؤال');
        return;
    }

    loadingDiv.style.display = 'block';
    resultDiv.innerHTML = '';

    try {
        // RAG: استخرج المواد ذات الصلة فقط بدل إرسال كل الداتاسيت
        const relevantArticles = retrieveRelevantArticles(searchInput);
        console.log(`🔍 RAG: وجدنا ${relevantArticles.length} مادة ذات صلة من أصل ${lawDataset.length}`);

        const systemPrompt = `أنت محلل قانوني متخصص في نظام العمل السعودي.

تعليمات صارمة لا تُخالَف أبداً:
- ممنوع منعاً باتاً أن تقدم نفسك أو تذكر اسمك أو الشركة التي طورتك
- ممنوع أي تحية أو مقدمة مثل "أهلاً" أو "مرحباً" أو ما شابهها
- ابدأ ردك مباشرة بـ "أولاً:" أو بالجواب مباشرة
- استخدم لغة عربية فصحى رسمية واضحة
- لا تستخدم النجوم أو الرموز: * ** *** # ##
- اذكر رقم المادة دائماً بالأرقام الإنجليزية فقط بين قوسين مثل: (المادة 98) - ممنوع كتابة رقم المادة بالحروف العربية
- رتب الإجابة: أولاً، ثانياً، ثالثاً`;

        const userPrompt = `المواد القانونية الأكثر صلة بالسؤال:
${JSON.stringify(relevantArticles, null, 2)}

سؤال الموظف: ${searchInput}

الرجاء الإجابة بشكل واضح ومباشر مع ذكر المادة المرجعية.`;

        const answer = await callAPI(systemPrompt, userPrompt);
        resultDiv.innerHTML = convertArticleReferencesToLinks(answer);
        sessionContext.search.previousContent = answer;
        showFollowUp('search', resultDiv, answer);

    } catch (error) {
        resultDiv.innerHTML = '❌ عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchLaw();
            }
        });
    }
});

// ========================================
// 2. كتابة الخطابات (مع RAG)
// ========================================

function updateFormalityField() {
    const recipientType = document.getElementById('recipientType').value;
    const formalityRow = document.getElementById('formalityRow');
    const formalitySelect = document.getElementById('formalityLevel');

    if (recipientType === 'شخص') {
        formalityRow.style.display = 'grid';
    } else {
        formalityRow.style.display = 'none';
        formalitySelect.value = '';
    }
}

async function generateLetter() {
    const letterType = document.getElementById('letterType').value;
    const recipientType = document.getElementById('recipientType').value;
    let formalityLevel = document.getElementById('formalityLevel').value;
    const applicantName = document.getElementById('applicantName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const concernedParty = document.getElementById('concernedParty').value.trim();
    const letterSubject = letterType; // يُستخدم نوع الخطاب كموضوع تلقائياً
    const letterDetails = document.getElementById('letterDetails').value.trim();
    const loadingDiv = document.getElementById('letterLoading');
    const resultDiv = document.getElementById('letterResult');
    const downloadSection = document.getElementById('downloadSection');

    if (recipientType !== 'شخص') {
        formalityLevel = 'رسمي';
    }

    if (!letterType || !recipientType || !applicantName || !phoneNumber || !concernedParty || !letterDetails) {
        alert('الرجاء تعبئة جميع الحقول');
        return;
    }

    if (recipientType === 'شخص' && !formalityLevel) {
        alert('الرجاء اختيار درجة الرسمية');
        return;
    }

    loadingDiv.style.display = 'block';
    resultDiv.innerHTML = '';
    downloadSection.style.display = 'none';

    try {
        const today = new Date();
        const hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(today);
        const gregorianDate = new Intl.DateTimeFormat('ar-SA', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
        }).format(today);

        // RAG: ابحث عن المواد المناسبة لموضوع الخطاب
        const relevantArticles = retrieveRelevantArticles(`${letterType} ${letterSubject} ${letterDetails}`, 5);
        console.log(`🔍 RAG: وجدنا ${relevantArticles.length} مادة للخطاب`);

        const systemPrompt = `أنت متخصص في كتابة الخطابات الرسمية الحكومية السعودية.

معلومات الخطاب:
- نوع المستلم: ${recipientType}
- الجهة/الشخص المعني: "${concernedParty}"
- درجة الرسمية: ${formalityLevel}
- نوع الخطاب: ${letterType}

**مهم جداً: التقيد الصارم بدرجة الرسمية:**

${formalityLevel === 'رسمي جداً' ? `
- استخدم "معالي" أو "سعادة" في المخاطبة
- لغة رسمية جداً وعبارات محترمة للغاية
- مثال: "يشرفني أن أتقدم لمعاليكم"، "أرجو من معاليكم التكرم"
` : ''}
${formalityLevel === 'رسمي' ? `
- استخدم "سعادة" أو "حضرة" في المخاطبة
- لغة رسمية واضحة ومهنية
- مثال: "أتقدم لسعادتكم"، "أرجو من سعادتكم"
` : ''}
${formalityLevel === 'شبه رسمي' ? `
- استخدم "الأستاذ" أو "السيد" في المخاطبة
- لغة واضحة ومباشرة
- مثال: "أود أن أوضح لكم"، "أرجو منكم"
` : ''}

مهمتك: تحليل الجهة/الشخص وتحديد القطاع تلقائياً:
- مستشفى/مركز صحي → قطاع صحي
- وزارة/هيئة عسكرية → قطاع عسكري
- جامعة/مدرسة → قطاع تعليمي
- محكمة/نيابة → قطاع قضائي
- بنك/مالية → قطاع مالي
- شركة → قطاع خاص

قواعد إلزامية:
1. ممنوع تقديم نفسك أو ذكر اسمك أو الشركة التي طورتك
2. ابدأ الخطاب مباشرة بالتاريخ
3. لا تستخدم رموز تنسيق: * ** # ##
4. طول الخطاب: 150-200 كلمة فقط (موجز ومباشر)
5. اذكر المواد بالأرقام الإنجليزية فقط مثل: (المادة 98) - ممنوع كتابة الأرقام بالحروف
6. لا تخترع أو تضيف تفاصيل لم يذكرها المستخدم

المواد القانونية المناسبة لهذا الخطاب:
${JSON.stringify(relevantArticles, null, 2)}

هيكل الخطاب:
التاريخ: ${hijriDate} الموافق ${gregorianDate}

[المخاطَب حسب نوع المستلم ودرجة الرسمية]
تحية طيبة وبعد،

الموضوع: [عنوان الخطاب]

[فقرة افتتاحية قصيرة]
[الفقرة الأولى: الموقف والتفاصيل]
[الفقرة الثانية: المادة القانونية + المطلوب]

[خاتمة قصيرة]

وتفضلوا بقبول فائق الاحترام والتقدير،

مقدم الطلب: ${applicantName}
رقم الجوال: ${phoneNumber}
التوقيع: ___________`;

        const userPrompt = `اكتب خطاباً رسمياً:

نوع الخطاب: ${letterType}
المستلم: ${recipientType}
الجهة/الشخص المعني: "${concernedParty}"
درجة الرسمية: ${formalityLevel}
الموضوع: ${letterSubject}
التفاصيل: ${letterDetails}

متطلبات هامة:
1. طول الخطاب: 150-200 كلمة فقط (موجز)
2. التزم بدرجة الرسمية "${formalityLevel}" بدقة
3. اذكر مادة واحدة فقط بالرقم الإنجليزي مثل: (المادة 98) - ممنوع كتابة رقم المادة بالحروف
4. لا تضف أي تفاصيل أو معلومات لم يذكرها المستخدم
5. اكتب فقط ما ذكره المستخدم بالضبط`;

        const letter = await callAPI(systemPrompt, userPrompt);
        resultDiv.innerHTML = convertArticleReferencesToLinks(letter);
        downloadSection.style.display = 'block';
        sessionContext.letter.previousContent = letter;
        showFollowUp('letter', resultDiv, letter);

    } catch (error) {
        resultDiv.innerHTML = '❌ عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// ========================================
// 3. شرح الأنظمة (مع RAG)
// ========================================

function toggleExplainMethod() {
    const selectedMethod = document.querySelector('input[name="explainMethod"]:checked').value;
    const contextMethod = document.getElementById('contextMethod');
    const numberMethod = document.getElementById('numberMethod');
    const resultDiv = document.getElementById('explainResult');

    if (selectedMethod === 'context') {
        contextMethod.classList.add('active');
        numberMethod.classList.remove('active');
    } else {
        contextMethod.classList.remove('active');
        numberMethod.classList.add('active');
    }

    resultDiv.innerHTML = '';
}

async function explainByContext() {
    const contextInput = document.getElementById('contextInput').value.trim();
    const loadingDiv = document.getElementById('explainLoading');
    const resultDiv = document.getElementById('explainResult');

    if (!contextInput) {
        alert('الرجاء كتابة وصف الموقف أو السؤال');
        return;
    }

    loadingDiv.style.display = 'block';
    resultDiv.innerHTML = '';

    try {
        console.log('🔍 RAG: البحث عن المواد المناسبة...');

        // RAG: استخرج المواد ذات الصلة
        const relevantArticles = retrieveRelevantArticles(contextInput);
        console.log(`📚 RAG: تم استخراج ${relevantArticles.length} مادة من ${lawDataset.length}`);

        // المرحلة 1: تحديد المادة المناسبة من المواد المستخرجة فقط
        const identifyPrompt = `أنت محلل قانوني ذكي متخصص في نظام العمل السعودي.

مهمتك: تحديد المادة الأنسب من القائمة التالية بناءً على وصف الموقف.

المواد المرشحة:
${JSON.stringify(relevantArticles, null, 2)}

وصف الموقف:
"${contextInput}"

المطلوب: اذكر رقم المادة الأنسب فقط كرقم، بدون أي شرح.
مثال للرد: 66`;

        const articleNumResponse = await callAPI(identifyPrompt, '');
        const articleNumber = parseInt(articleNumResponse.trim());

        console.log('📌 تم تحديد المادة:', articleNumber);

        if (!articleNumber || articleNumber < 1 || articleNumber > 245) {
            resultDiv.innerHTML = '⚠️ عذراً، لم أتمكن من تحديد مادة مناسبة. جرب إعادة صياغة السؤال.';
            return;
        }

        const article = lawDataset.find(item => item.id === articleNumber);

        if (!article) {
            resultDiv.innerHTML = '❌ المادة غير موجودة في قاعدة البيانات';
            return;
        }

        // المرحلة 2: شرح المادة
        const explainPrompt = `أنت محلل قانوني متخصص في نظام العمل السعودي.

تعليمات صارمة لا تُخالَف أبداً:
- ممنوع منعاً باتاً أن تقدم نفسك أو تذكر اسمك أو الشركة التي طورتك
- ممنوع أي تحية أو مقدمة
- ابدأ مباشرة بـ "أولاً:" أو بالشرح مباشرة
- لا تستخدم النجوم أو الرموز: * ** *** # ##
- استخدم لغة بسيطة واضحة مع الاحترافية
- رتب المعلومات: أولاً، ثانياً، ثالثاً
- اربط الشرح بالموقف المذكور
- اذكر أرقام المواد بالأرقام الإنجليزية فقط بين قوسين: (المادة 98) - ممنوع كتابة الأرقام بالحروف`;

        const userPrompt = `المادة ${article.article} من نظام العمل:
"${article.text}"

الموقف المطروح:
"${contextInput}"

اشرح هذه المادة وكيف تنطبق على الموقف المذكور.`;

        const explanation = await callAPI(explainPrompt, userPrompt);

        resultDiv.innerHTML = `
            <div style="background: #f0f7ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-right: 4px solid #667eea;">
                <strong>🎯 المادة المناسبة لموقفك:</strong> (المادة ${article.id})
            </div>
            <div style="background: #fff9e6; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-right: 4px solid #D4AF37;">
                <strong>📋 نص المادة:</strong><br><br>
                ${article.text}
            </div>
            <div style="line-height: 1.8;">
                ${convertArticleReferencesToLinks(explanation)}
            </div>
        `;
        sessionContext.explain.previousContent = `المادة ${article.id}: ${article.text}\n\n${explanation}`;
        showFollowUp('explain', resultDiv, sessionContext.explain.previousContent);

        console.log('✅ تم الشرح بنجاح');

    } catch (error) {
        console.error('❌ خطأ:', error);
        resultDiv.innerHTML = '❌ عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

async function explainArticle() {
    const articleNumber = parseInt(document.getElementById('articleNumber').value);
    const loadingDiv = document.getElementById('explainLoading');
    const resultDiv = document.getElementById('explainResult');

    if (!articleNumber || articleNumber < 1 || articleNumber > 245) {
        alert('الرجاء إدخال رقم مادة صحيح (من 1 إلى 245)');
        return;
    }

    const article = lawDataset.find(item => item.id === articleNumber);

    if (!article) {
        alert('المادة غير موجودة');
        return;
    }

    loadingDiv.style.display = 'block';
    resultDiv.innerHTML = '';

    try {
        const systemPrompt = `أنت محلل قانوني متخصص في نظام العمل السعودي.

تعليمات صارمة لا تُخالَف أبداً:
- ممنوع منعاً باتاً أن تقدم نفسك أو تذكر اسمك أو الشركة التي طورتك
- ممنوع أي تحية أو مقدمة
- ابدأ مباشرة بـ "أولاً:" أو بالشرح مباشرة
- لا تستخدم النجوم أو الرموز: * ** *** # ##
- استخدم لغة بسيطة واضحة مع الاحترافية
- رتب المعلومات: أولاً، ثانياً، ثالثاً
- اذكر أرقام المواد بالأرقام الإنجليزية فقط بين قوسين: (المادة 98) - ممنوع كتابة الأرقام بالحروف`;

        const userPrompt = `المادة ${article.article} من نظام العمل:
"${article.text}"

اشرح هذه المادة بلغة بسيطة للموظف العادي.`;

        const explanation = await callAPI(systemPrompt, userPrompt);
        resultDiv.innerHTML = `
            <div style="background: #f0f7ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-right: 4px solid #667eea;">
                <strong>📌 المادة المطلوبة:</strong> (المادة ${article.id})
            </div>
            <div style="background: #fff9e6; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-right: 4px solid #D4AF37;">
                <strong>📋 نص المادة:</strong><br><br>
                ${article.text}
            </div>
            <div style="line-height: 1.8;">
                ${convertArticleReferencesToLinks(explanation)}
            </div>
        `;
        sessionContext.explain.previousContent = `المادة ${article.id}: ${article.text}\n\n${explanation}`;
        showFollowUp('explain', resultDiv, sessionContext.explain.previousContent);

    } catch (error) {
        resultDiv.innerHTML = '❌ عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const articleInput = document.getElementById('articleNumber');
    if (articleInput) {
        articleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                explainArticle();
            }
        });
    }
});

// ========================================
// 4. تحميل الخطاب كملف Word
// ========================================

function downloadWord() {
    const letterResultDiv = document.getElementById('letterResult');

    if (!letterResultDiv || !letterResultDiv.innerText) {
        alert('لا يوجد خطاب لتحميله');
        return;
    }

    const tempDiv = letterResultDiv.cloneNode(true);
    const articleLinks = tempDiv.querySelectorAll('.article-link');
    articleLinks.forEach(link => {
        link.replaceWith(link.textContent);
    });

    const letterContent = tempDiv.innerText;

    if (!letterContent) {
        alert('لا يوجد خطاب لتحميله');
        return;
    }

    const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office'
              xmlns:w='urn:schemas-microsoft-com:office:word'
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <style>
                body {
                    font-family: 'Arial', 'Tahoma', sans-serif;
                    direction: rtl;
                    text-align: right;
                    line-height: 1.8;
                    padding: 40px;
                    font-size: 14pt;
                }
                p { margin: 10px 0; }
            </style>
        </head>
        <body>
            <div style="white-space: pre-wrap;">${letterContent}</div>
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], {
        type: 'application/msword'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'الخطاب_الرسمي.doc';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ تم تحميل الخطاب');
}

console.log('✅ تم تحميل البرنامج بنجاح');

// ========================================
// 5. نظام عرض المواد المنبثق
// ========================================

function convertArticleReferencesToLinks(text) {
    // خريطة الأرقام المكتوبة بالعربية
    const writtenNumbers = {
        'الأولى': 1, 'الأول': 1, 'الثانية': 2, 'الثاني': 2,
        'الثالثة': 3, 'الثالث': 3, 'الرابعة': 4, 'الرابع': 4,
        'الخامسة': 5, 'الخامس': 5, 'السادسة': 6, 'السادس': 6,
        'السابعة': 7, 'السابع': 7, 'الثامنة': 8, 'الثامن': 8,
        'التاسعة': 9, 'التاسع': 9, 'العاشرة': 10, 'العاشر': 10,
        'الحادية عشرة': 11, 'الحادي عشر': 11, 'الثانية عشرة': 12, 'الثاني عشر': 12,
        'الثالثة عشرة': 13, 'الثالث عشر': 13, 'الرابعة عشرة': 14, 'الرابع عشر': 14,
        'الخامسة عشرة': 15, 'الخامس عشر': 15, 'السادسة عشرة': 16, 'السادس عشر': 16,
        'السابعة عشرة': 17, 'السابع عشر': 17, 'الثامنة عشرة': 18, 'الثامن عشر': 18,
        'التاسعة عشرة': 19, 'التاسع عشر': 19, 'العشرون': 20, 'العشرين': 20,
        'الحادية والعشرون': 21, 'الحادي والعشرون': 21,
        'الثانية والعشرون': 22, 'الثاني والعشرون': 22,
        'الثلاثون': 30, 'الثلاثين': 30, 'الأربعون': 40, 'الأربعين': 40,
        'الخمسون': 50, 'الخمسين': 50, 'الستون': 60, 'الستين': 60,
        'السبعون': 70, 'السبعين': 70, 'الثمانون': 80, 'الثمانين': 80,
        'التسعون': 90, 'التسعين': 90, 'المئة': 100, 'مئة': 100,
        'الخامسة والسبعون': 75, 'الخامس والسبعون': 75,
        'الرابعة والسبعون': 74, 'الرابع والسبعون': 74,
        'الثالثة والسبعون': 73, 'الثالث والسبعون': 73,
        'الثانية والسبعون': 72, 'الثاني والسبعون': 72,
        'الحادية والسبعون': 71, 'الحادي والسبعون': 71,
        'التاسعة والستون': 69, 'التاسع والستون': 69,
        'الثامنة والستون': 68, 'الثامن والستون': 68,
        'السابعة والستون': 67, 'السابع والستون': 67,
        'السادسة والستون': 66, 'السادس والستون': 66,
        'الخامسة والستون': 65, 'الخامس والستون': 65,
        'الرابعة والستون': 64, 'الرابع والستون': 64,
        'الثالثة والستون': 63, 'الثالث والستون': 63,
        'الثانية والستون': 62, 'الثاني والستون': 62,
        'الحادية والستون': 61, 'الحادي والستون': 61,
        'التاسعة والخمسون': 59, 'التاسع والخمسون': 59,
        'الثامنة والخمسون': 58, 'الثامن والخمسون': 58,
        'السابعة والخمسون': 57, 'السابع والخمسون': 57,
        'السادسة والخمسون': 56, 'السادس والخمسون': 56,
        'الخامسة والخمسون': 55, 'الخامس والخمسون': 55,
        'الرابعة والخمسون': 54, 'الرابع والخمسون': 54,
        'الثالثة والخمسون': 53, 'الثالث والخمسون': 53,
        'الثانية والخمسون': 52, 'الثاني والخمسون': 52,
        'الحادية والخمسون': 51, 'الحادي والخمسون': 51,
        'التاسعة والأربعون': 49, 'التاسع والأربعون': 49,
        'الثامنة والأربعون': 48, 'الثامن والأربعون': 48,
        'السابعة والأربعون': 47, 'السابع والأربعون': 47,
        'السادسة والأربعون': 46, 'السادس والأربعون': 46,
        'الخامسة والأربعون': 45, 'الخامس والأربعون': 45,
        'الرابعة والأربعون': 44, 'الرابع والأربعون': 44,
        'الثالثة والأربعون': 43, 'الثالث والأربعون': 43,
        'الثانية والأربعون': 42, 'الثاني والأربعون': 42,
        'الحادية والأربعون': 41, 'الحادي والأربعون': 41,
        'التاسعة والثلاثون': 39, 'التاسع والثلاثون': 39,
        'الثامنة والثلاثون': 38, 'الثامن والثلاثون': 38,
        'السابعة والثلاثون': 37, 'السابع والثلاثون': 37,
        'السادسة والثلاثون': 36, 'السادس والثلاثون': 36,
        'الخامسة والثلاثون': 35, 'الخامس والثلاثون': 35,
        'الرابعة والثلاثون': 34, 'الرابع والثلاثون': 34,
        'الثالثة والثلاثون': 33, 'الثالث والثلاثون': 33,
        'الثانية والثلاثون': 32, 'الثاني والثلاثون': 32,
        'الحادية والثلاثون': 31, 'الحادي والثلاثون': 31,
        'التاسعة والعشرون': 29, 'التاسع والعشرون': 29,
        'الثامنة والعشرون': 28, 'الثامن والعشرون': 28,
        'السابعة والعشرون': 27, 'السابع والعشرون': 27,
        'السادسة والعشرون': 26, 'السادس والعشرون': 26,
        'الخامسة والعشرون': 25, 'الخامس والعشرون': 25,
        'الرابعة والعشرون': 24, 'الرابع والعشرون': 24,
        'الثالثة والعشرون': 23, 'الثالث والعشرون': 23,
        'الحادية والعشرون': 21, 'الحادي والعشرون': 21,
        'التاسعة والتسعون': 99, 'التاسع والتسعون': 99,
        'الثامنة والتسعون': 98, 'الثامن والتسعون': 98,
        'السابعة والتسعون': 97, 'السابع والتسعون': 97,
        'السادسة والتسعون': 96, 'السادس والتسعون': 96,
        'الخامسة والتسعون': 95, 'الخامس والتسعون': 95,
        'الرابعة والتسعون': 94, 'الرابع والتسعون': 94,
        'الثالثة والتسعون': 93, 'الثالث والتسعون': 93,
        'الثانية والتسعون': 92, 'الثاني والتسعون': 92,
        'الحادية والتسعون': 91, 'الحادي والتسعون': 91,
        'التاسعة والثمانون': 89, 'التاسع والثمانون': 89,
        'الثامنة والثمانون': 88, 'الثامن والثمانون': 88,
        'السابعة والثمانون': 87, 'السابع والثمانون': 87,
        'السادسة والثمانون': 86, 'السادس والثمانون': 86,
        'الخامسة والثمانون': 85, 'الخامس والثمانون': 85,
        'الرابعة والثمانون': 84, 'الرابع والثمانون': 84,
        'الثالثة والثمانون': 83, 'الثالث والثمانون': 83,
        'الثانية والثمانون': 82, 'الثاني والثمانون': 82,
        'الحادية والثمانون': 81, 'الحادي والثمانون': 81,
        'التاسعة والسبعون': 79, 'التاسع والسبعون': 79,
        'الثامنة والسبعون': 78, 'الثامن والسبعون': 78,
        'السابعة والسبعون': 77, 'السابع والسبعون': 77,
        'السادسة والسبعون': 76, 'السادس والسبعون': 76,
        'مائة وسبعة': 107, 'مائة وثمانية': 108, 'مائة وتسعة': 109,
        'مائة وعشرة': 110, 'مائة وأحد عشر': 111, 'مائة واثني عشر': 112,
        // المئة
        'المائة': 100, 'مائة': 100,
        'مائة وواحد': 101, 'مائة واثنان': 102, 'مائة وثلاثة': 103,
        'مائة وأربعة': 104, 'مائة وخمسة': 105, 'مائة وستة': 106,
        'مائة وثلاثة عشر': 113, 'مائة وأربعة عشر': 114, 'مائة وخمسة عشر': 115,
        'مائة وستة عشر': 116, 'مائة وسبعة عشر': 117, 'مائة وثمانية عشر': 118,
        'مائة وتسعة عشر': 119, 'مائة وعشرون': 120, 'مائة وعشرين': 120,
        'مائة وواحد وعشرون': 121, 'مائة واثنان وعشرون': 122,
        'مائة وثلاثة وعشرون': 123, 'مائة وأربعة وعشرون': 124,
        'مائة وخمسة وعشرون': 125, 'مائة وستة وعشرون': 126,
        'مائة وسبعة وعشرون': 127, 'مائة وثمانية وعشرون': 128,
        'مائة وتسعة وعشرون': 129, 'مائة وثلاثون': 130, 'مائة وثلاثين': 130,
        'مائة وواحد وثلاثون': 131, 'مائة واثنان وثلاثون': 132,
        'مائة وثلاثة وثلاثون': 133, 'مائة وأربعة وثلاثون': 134,
        'مائة وخمسة وثلاثون': 135, 'مائة وستة وثلاثون': 136,
        'مائة وسبعة وثلاثون': 137, 'مائة وثمانية وثلاثون': 138,
        'مائة وتسعة وثلاثون': 139, 'مائة وأربعون': 140, 'مائة وأربعين': 140,
        'مائة وواحد وأربعون': 141, 'مائة واثنان وأربعون': 142,
        'مائة وثلاثة وأربعون': 143, 'مائة وأربعة وأربعون': 144,
        'مائة وخمسة وأربعون': 145, 'مائة وستة وأربعون': 146,
        'مائة وسبعة وأربعون': 147, 'مائة وثمانية وأربعون': 148,
        'مائة وتسعة وأربعون': 149, 'مائة وخمسون': 150, 'مائة وخمسين': 150,
        'مائة وواحد وخمسون': 151, 'مائة واثنان وخمسون': 152,
        'مائة وثلاثة وخمسون': 153, 'مائة وأربعة وخمسون': 154,
        'مائة وخمسة وخمسون': 155, 'مائة وستة وخمسون': 156,
        'مائة وسبعة وخمسون': 157, 'مائة وثمانية وخمسون': 158,
        'مائة وتسعة وخمسون': 159, 'مائة وستون': 160, 'مائة وستين': 160,
        'مائة وواحد وستون': 161, 'مائة واثنان وستون': 162,
        'مائة وثلاثة وستون': 163, 'مائة وأربعة وستون': 164,
        'مائة وخمسة وستون': 165, 'مائة وستة وستون': 166,
        'مائة وسبعة وستون': 167, 'مائة وثمانية وستون': 168,
        'مائة وتسعة وستون': 169, 'مائة وسبعون': 170, 'مائة وسبعين': 170,
        'مائة وواحد وسبعون': 171, 'مائة واثنان وسبعون': 172,
        'مائة وثلاثة وسبعون': 173, 'مائة وأربعة وسبعون': 174,
        'مائة وخمسة وسبعون': 175, 'مائة وستة وسبعون': 176,
        'مائة وسبعة وسبعون': 177, 'مائة وثمانية وسبعون': 178,
        'مائة وتسعة وسبعون': 179, 'مائة وثمانون': 180, 'مائة وثمانين': 180,
        'مائة وواحد وثمانون': 181, 'مائة واثنان وثمانون': 182,
        'مائة وثلاثة وثمانون': 183, 'مائة وأربعة وثمانون': 184,
        'مائة وخمسة وثمانون': 185, 'مائة وستة وثمانون': 186,
        'مائة وسبعة وثمانون': 187, 'مائة وثمانية وثمانون': 188,
        'مائة وتسعة وثمانون': 189, 'مائة وتسعون': 190, 'مائة وتسعين': 190,
        'مائة وواحد وتسعون': 191, 'مائة واثنان وتسعون': 192,
        'مائة وثلاثة وتسعون': 193, 'مائة وأربعة وتسعون': 194,
        'مائة وخمسة وتسعون': 195, 'مائة وستة وتسعون': 196,
        'مائة وسبعة وتسعون': 197, 'مائة وثمانية وتسعون': 198,
        'مائة وتسعة وتسعون': 199,
        'مئتان': 200, 'مئتين': 200,
        'مئتان وواحد': 201, 'مئتان واثنان': 202, 'مئتان وثلاثة': 203,
        'مئتان وأربعة': 204, 'مئتان وخمسة': 205, 'مئتان وستة': 206,
        'مئتان وسبعة': 207, 'مئتان وثمانية': 208, 'مئتان وتسعة': 209,
        'مئتان وعشرة': 210, 'مئتان وأحد عشر': 211, 'مئتان واثنا عشر': 212,
        'مئتان وثلاثة عشر': 213, 'مئتان وأربعة عشر': 214, 'مئتان وخمسة عشر': 215,
        'مئتان وستة عشر': 216, 'مئتان وسبعة عشر': 217, 'مئتان وثمانية عشر': 218,
        'مئتان وتسعة عشر': 219, 'مئتان وعشرون': 220, 'مئتان وعشرين': 220,
        'مئتان وواحد وعشرون': 221, 'مئتان واثنان وعشرون': 222,
        'مئتان وثلاثة وعشرون': 223, 'مئتان وأربعة وعشرون': 224,
        'مئتان وخمسة وعشرون': 225, 'مئتان وستة وعشرون': 226,
        'مئتان وسبعة وعشرون': 227, 'مئتان وثمانية وعشرون': 228,
        'مئتان وتسعة وعشرون': 229, 'مئتان وثلاثون': 230,
        'مئتان وواحد وثلاثون': 231, 'مئتان واثنان وثلاثون': 232,
        'مئتان وثلاثة وثلاثون': 233, 'مئتان وأربعة وثلاثون': 234,
        'مئتان وخمسة وثلاثون': 235, 'مئتان وستة وثلاثون': 236,
        'مئتان وسبعة وثلاثون': 237, 'مئتان وثمانية وثلاثون': 238,
        'مئتان وتسعة وثلاثون': 239, 'مئتان وأربعون': 240,
        'مئتان وواحد وأربعون': 241, 'مئتان واثنان وأربعون': 242,
        'مئتان وثلاثة وأربعون': 243, 'مئتان وأربعة وأربعون': 244,
        'مئتان وخمسة وأربعون': 245
    };

    function arabicToEnglish(str) {
        return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    }

    let result = text;

    // النمط 1: أرقام إنجليزية مع أو بدون أقواس
    result = result.replace(/\(?\s*المادة\s+(\d+)\s*\)?/g, (match, num) => {
        const articleNum = parseInt(num);
        if (articleNum >= 1 && articleNum <= 245) {
            return `<span class="article-link" onclick="showArticleModal(${articleNum})">(المادة ${articleNum})</span>`;
        }
        return match;
    });

    // النمط 2: أرقام عربية
    result = result.replace(/\(?\s*المادة\s+([٠-٩]+)\s*\)?/g, (match, num) => {
        const articleNum = parseInt(arabicToEnglish(num));
        if (articleNum >= 1 && articleNum <= 245) {
            return `<span class="article-link" onclick="showArticleModal(${articleNum})">(المادة ${articleNum})</span>`;
        }
        return match;
    });

    // النمط 3: أرقام مكتوبة بالحروف — ابحث عن الأطول أولاً
    const sortedKeys = Object.keys(writtenNumbers).sort((a, b) => b.length - a.length);
    for (const written of sortedKeys) {
        const num = writtenNumbers[written];
        const regex = new RegExp(`المادة\\s+${written}`, 'g');
        result = result.replace(regex, () => {
            return `<span class="article-link" onclick="showArticleModal(${num})">(المادة ${num})</span>`;
        });
    }

    return result;
}

function showArticleModal(articleNumber) {
    const article = lawDataset.find(item => item.id === parseInt(articleNumber));

    if (!article) {
        alert('المادة غير موجودة');
        return;
    }

    const modal = document.getElementById('articleModal');
    const modalTitle = document.getElementById('modalArticleNumber');
    const modalContent = document.getElementById('modalArticleContent');

    modalTitle.textContent = `المادة ${article.id}`;
    modalContent.innerHTML = `
        <div style="background: #fff9e6; padding: 1.5rem; border-radius: 0.75rem; border-right: 4px solid #D4AF37; margin-bottom: 1.5rem;">
            <h4 style="font-weight: 700; margin-bottom: 1rem; color: var(--text);">📋 نص المادة:</h4>
            <p style="line-height: 1.8; color: var(--text); white-space: pre-wrap;">${article.text}</p>
        </div>
    `;

    modal.classList.add('active');
}

function closeArticleModal() {
    const modal = document.getElementById('articleModal');
    modal.classList.remove('active');
}

// ========================================
// 6. أزرار المتابعة بعد كل نتيجة
// ========================================

// يحفظ السياق السابق لكل تبويب
const sessionContext = {
    search: { previousContent: '', conversationHistory: [] },
    letter: { previousContent: '', conversationHistory: [] },
    explain: { previousContent: '', conversationHistory: [] }
};

function showFollowUp(type, resultDiv, currentContent) {
    // احفظ السياق الحالي
    if (currentContent) {
        sessionContext[type].previousContent = currentContent;
    }

    const messages = {
        search: 'هل تريد مساعدة إضافية؟',
        letter: 'هل تريد تعديل الخطاب؟',
        explain: 'هل تريد مساعدة إضافية؟'
    };

    const placeholders = {
        search: 'مثال: وضّح لي أكثر، أو اسألني عن تفصيل معين...',
        letter: 'مثال: اجعل الأسلوب أقوى، أو أضف فقرة عن...',
        explain: 'مثال: وضّح لي أكثر، أو ماذا يحدث إذا...'
    };

    // احذف أي followup سابق
    const old = resultDiv.querySelector('.followup-container');
    if (old) old.remove();

    const followUpDiv = document.createElement('div');
    followUpDiv.className = 'followup-container';
    followUpDiv.innerHTML = `
        <div class="followup-question">
            <span>${messages[type]}</span>
            <div class="followup-buttons">
                <button class="followup-btn yes" onclick="handleFollowUp(this)">نعم</button>
                <button class="followup-btn no" onclick="this.closest('.followup-container').remove()">لا</button>
            </div>
        </div>
        <div class="followup-input" style="display:none;">
            <textarea class="form-input followup-textarea" rows="3" placeholder="${placeholders[type]}"></textarea>
            <button class="btn-primary followup-send" onclick="sendFollowUp(this, '${type}')">إرسال</button>
        </div>
        <div class="followup-result"></div>
    `;
    resultDiv.appendChild(followUpDiv);
}

function handleFollowUp(btn) {
    const container = btn.closest('.followup-container');
    container.querySelector('.followup-question').style.display = 'none';
    container.querySelector('.followup-input').style.display = 'block';
    container.querySelector('.followup-textarea').focus();
}

async function sendFollowUp(btn, type) {
    const container = btn.closest('.followup-container');
    const textarea = container.querySelector('.followup-textarea');
    const resultDiv = container.querySelector('.followup-result');
    const userInput = textarea.value.trim();

    if (!userInput) {
        alert('الرجاء كتابة طلبك');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'جاري المعالجة...';
    resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>جاري المعالجة...</p></div>';

    try {
        const context = sessionContext[type];
        const relevantArticles = retrieveRelevantArticles(userInput + ' ' + context.previousContent.substring(0, 200));

        let systemPrompt = '';
        let userPrompt = '';

        if (type === 'letter') {
            // تعديل الخطاب — يرسل النص الكامل ويطلب التعديل
            systemPrompt = `أنت متخصص في تعديل الخطابات الرسمية السعودية.
قواعد التعديل:
1. عدّل الخطاب بناءً على طلب المستخدم فقط
2. أعد كتابة الخطاب كاملاً بعد التعديل
3. لا تستخدم رموز تنسيق: * ** # ##
4. حافظ على نفس الهيكل والتاريخ والبيانات
5. اذكر المواد بالأرقام الإنجليزية فقط مثل: (المادة 98) - ممنوع كتابة الأرقام بالحروف`;

            userPrompt = `الخطاب الحالي:
"${context.previousContent}"

طلب التعديل: ${userInput}

أعد كتابة الخطاب كاملاً مع تطبيق التعديل المطلوب فقط.`;

        } else {
            // بحث أو شرح — يتذكر السياق السابق
            systemPrompt = `أنت مساعد قانوني متخصص في نظام العمل السعودي.
قواعد الرد:
1. أنت تعرف السياق السابق للمحادثة، لا تطلب من المستخدم إعادة الشرح
2. ابدأ مباشرة بالإجابة
3. لا تستخدم رموز تنسيق: * ** # ##
4. اذكر المواد بالأرقام الإنجليزية فقط مثل: (المادة 98) - ممنوع كتابة الأرقام بالحروف
5. رد موجز ومباشر مبني على السياق السابق`;

            userPrompt = `السياق السابق للمحادثة:
"${context.previousContent.substring(0, 500)}"

المواد القانونية ذات الصلة:
${JSON.stringify(relevantArticles, null, 2)}

السؤال الجديد: ${userInput}`;
        }

        const answer = await callAPI(systemPrompt, userPrompt);

        // حدّث السياق
        sessionContext[type].previousContent = answer;

        const displayHTML = type === 'letter'
            ? `<div style="background: #fff; padding: 20px; border-radius: 8px; margin-top: 15px; border: 1px solid #E5E7EB; line-height: 2;">
                ${convertArticleReferencesToLinks(answer)}
               </div>`
            : `<div style="background: #f0f7ff; padding: 15px; border-radius: 8px; margin-top: 15px; border-right: 4px solid #006C35; line-height: 1.8;">
                ${convertArticleReferencesToLinks(answer)}
               </div>`;

        resultDiv.innerHTML = displayHTML;

        // اعرض followup جديد
        showFollowUp(type, resultDiv, answer);

    } catch (error) {
        resultDiv.innerHTML = '❌ عذراً، حدث خطأ. الرجاء المحاولة مرة أخرى.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'إرسال';
    }
}
