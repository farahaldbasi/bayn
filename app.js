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

        const systemPrompt = `أنت محلل قانوني في منصة حكومية سعودية متخصصة في نظام العمل.

قواعد الرد الإلزامية:
1. لا تقدم نفسك أبداً ولا تستخدم أي تحيات شخصية
2. ابدأ مباشرة بالإجابة بأسلوب رسمي حكومي
3. استخدم لغة عربية فصحى واضحة بدون رموز تنسيق
4. لا تستخدم النجوم أو الرموز مثل: * ** *** # ##
5. اذكر رقم المادة بين قوسين مثل: (المادة 98)
6. رتب الإجابة بنقاط واضحة: أولاً، ثانياً، ثالثاً`;

        const userPrompt = `المواد القانونية الأكثر صلة بالسؤال:
${JSON.stringify(relevantArticles, null, 2)}

سؤال الموظف: ${searchInput}

الرجاء الإجابة بشكل واضح ومباشر مع ذكر المادة المرجعية.`;

        const answer = await callAPI(systemPrompt, userPrompt);
        resultDiv.innerHTML = convertArticleReferencesToLinks(answer);

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
    const letterSubject = document.getElementById('letterSubject').value.trim();
    const letterDetails = document.getElementById('letterDetails').value.trim();
    const loadingDiv = document.getElementById('letterLoading');
    const resultDiv = document.getElementById('letterResult');
    const downloadSection = document.getElementById('downloadSection');

    if (recipientType !== 'شخص') {
        formalityLevel = 'رسمي';
    }

    if (!letterType || !recipientType || !applicantName || !phoneNumber || !concernedParty || !letterSubject || !letterDetails) {
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
1. لا تقدم نفسك أبداً
2. لا تستخدم رموز تنسيق: * ** # ##
3. طول الخطاب: 200-300 كلمة
4. اذكر المواد بصيغة: (المادة X)

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
1. طول الخطاب: 200-300 كلمة فقط
2. التزم بدرجة الرسمية "${formalityLevel}" بدقة
3. اذكر مادة واحدة فقط من نظام العمل بصيغة (المادة X)
4. فقرتان رئيسيتان فقط + مقدمة وخاتمة قصيرة
5. لا تكرر المعلومات ولا تطيل`;

        const letter = await callAPI(systemPrompt, userPrompt);
        resultDiv.innerHTML = convertArticleReferencesToLinks(letter);
        downloadSection.style.display = 'block';

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
        const explainPrompt = `أنت محلل قانوني متخصص في منصة حكومية سعودية.

قواعد الشرح الإلزامية:
1. لا تقدم نفسك ولا تستخدم تحيات شخصية
2. اشرح بأسلوب رسمي واضح بدون أي رموز تنسيق
3. لا تستخدم النجوم أو الرموز مثل: * ** *** # ##
4. استخدم لغة بسيطة مع الحفاظ على الاحترافية
5. رتب المعلومات: أولاً، ثانياً، ثالثاً
6. اربط الشرح بالموقف المذكور
7. عند ذكر أي مادة قانونية، اكتبها بالصيغة: (المادة X)`;

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
        const systemPrompt = `أنت محلل قانوني متخصص في منصة حكومية سعودية.

قواعد الشرح الإلزامية:
1. لا تقدم نفسك ولا تستخدم تحيات شخصية
2. اشرح بأسلوب رسمي واضح بدون أي رموز تنسيق
3. لا تستخدم النجوم أو الرموز مثل: * ** *** # ##
4. استخدم لغة بسيطة مع الحفاظ على الاحترافية
5. رتب المعلومات: أولاً، ثانياً، ثالثاً
6. عند ذكر أي مادة قانونية، اكتبها بالصيغة: (المادة X)`;

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
    const regex = /\(المادة\s+(\d+)\)/g;
    return text.replace(regex, (match, articleNum) => {
        return `<span class="article-link" onclick="showArticleModal(${articleNum})">${match}</span>`;
    });
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
