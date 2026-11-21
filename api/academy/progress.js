import { firestoreGet, firestoreTransaction, requireFirebaseUser, sendApiError } from '../_lib/firebase-rest.js';

function questionData(question) {
  if (Array.isArray(question)) return { correctIndex: Number(question[2]) };
  return { correctIndex: Number(question?.correctIndex) };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const user = await requireFirebaseUser(req);
    const body = req.body || {};
    const courseId = String(body.courseId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const answers = body.answers;
    if (!courseId || !moduleId || courseId.includes('/') || moduleId.includes('/') || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'A course, module and assessment answers are required.' });
    }

    const course = await firestoreGet('academyCourses/' + courseId);
    if (!course || course.status !== 'published' || !Array.isArray(course.modules)) {
      return res.status(404).json({ error: 'This published course could not be found.' });
    }
    const moduleIndex = course.modules.findIndex(module => module.id === moduleId);
    if (moduleIndex < 0) return res.status(404).json({ error: 'This module does not belong to the selected course.' });
    const module = course.modules[moduleIndex];
    const quiz = Array.isArray(module.quiz) ? module.quiz : [];
    if (!quiz.length || answers.length !== quiz.length || answers.some(value => !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 3)) {
      return res.status(400).json({ error: 'Answer every question before submitting the assessment.' });
    }

    const correct = quiz.reduce((count, question, index) => {
      const expected = questionData(question).correctIndex;
      return count + (Number(answers[index]) === expected ? 1 : 0);
    }, 0);
    const score = Math.round((correct / quiz.length) * 100);
    const passed = score >= 80;
    if (!passed) return res.status(200).json({ assessment: { score, correct, passed: false }, progress: null });

    const progressPath = 'academyProgress/' + user.uid + '/courses/' + courseId;
    const progress = await firestoreTransaction(async tx => {
      const current = await tx.get(progressPath) || {};
      const completedModules = Array.isArray(current.completedModules) ? current.completedModules : [];
      if (moduleIndex > 0 && !completedModules.includes(course.modules[moduleIndex - 1].id)) {
        const error = new Error('Complete the previous module before submitting this assessment.');
        error.status = 409;
        throw error;
      }
      const nextCompleted = Array.from(new Set(completedModules.concat(moduleId)));
      const scores = { ...(current.scores || {}), [moduleId]: score };
      const courseCompleted = nextCompleted.length === course.modules.length &&
        course.modules.every(item => nextCompleted.includes(item.id));
      const next = {
        courseId,
        courseTitle: course.title || '',
        completedModules: nextCompleted,
        scores,
        lastModule: moduleIndex,
        courseCompleted,
        completedAt: courseCompleted ? (current.completedAt || new Date().toISOString()) : null,
        ownerUid: user.uid,
        updatedAt: Date.now()
      };
      tx.set(progressPath, next);
      return next;
    });

    return res.status(200).json({ assessment: { score, correct, passed: true }, progress });
  } catch (error) {
    return sendApiError(res, error);
  }
}
