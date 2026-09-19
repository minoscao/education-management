const profiles: Record<string, { photo: number; bio: string }> = {
  'teacher-hana': { photo: 0, bio: 'Hana teaches language through stories, conversation and short writing activities. She breaks new ideas into clear steps and gives students space to practise. Her lessons build confidence in Mandarin and English.' },
  'teacher-mira': { photo: 1, bio: 'Mira helps students connect Bahasa and English with everyday situations. Her classes combine reading, vocabulary games and guided writing. She gives calm, practical feedback after each activity.' },
  'teacher-farah': { photo: 2, bio: 'Farah makes speaking practice approachable with pair work and real-life role play. She encourages every learner to ask questions and share ideas. Her communication classes focus on clarity, listening and confidence.' },
  'teacher-zara': { photo: 3, bio: 'Zara guides secondary learners through reading, discussion and structured writing. She makes room for different learning speeds and explains how to improve each answer. Her lessons balance language accuracy with independent thinking.' },
  'teacher-nadia': { photo: 4, bio: 'Nadia uses worked examples and visual explanations to make advanced maths easier to follow. Students practise one idea at a time before trying a challenge. She uses Sudoku to develop careful reasoning and persistence.' },
  'teacher-tan-uec': { photo: 5, bio: 'Tan teaches Chinese through close reading, conversation and purposeful writing. His lessons help students explain their ideas clearly and expand their vocabulary. He gives individual feedback and manageable practice tasks.' },
  'teacher-wong-kai': { photo: 6, bio: 'Wong Kai connects mathematical ideas to patterns and practical problems. His lessons move from a clear example to independent practice. He uses Sudoku challenges to encourage flexible problem solving.' },
  'teacher-ng-jun': { photo: 7, bio: 'Ng Jun helps lower secondary students build a solid foundation in maths. He explains each method step by step and checks understanding with short exercises. His classes encourage questions and treat mistakes as part of learning.' },
  'teacher-chen-yi': { photo: 8, bio: 'Chen Yi uses diagrams, examples and guided practice to explain maths. He encourages students to describe their reasoning, not only give an answer. Sudoku activities strengthen concentration and logical thinking.' },
  'teacher-lim-wei': { photo: 9, bio: 'Lim Wei makes primary maths concrete with pictures, number patterns and familiar examples. His lessons mix short explanations with hands-on practice. Students build confidence through achievable challenges and friendly feedback.' },
};

export function demoTeacherProfile(id: string, subject: string) {
  const profile = profiles[id];
  const index = profile?.photo ?? [...id].reduce((n, letter) => n + letter.charCodeAt(0), 0) % 10;
  return {
    avatar_url: `/assets/teachers/demo-${index}.jpg`,
    bio: profile?.bio ?? `Lessons in ${subject || 'this subject'} combine clear explanations with guided practice. Students are encouraged to ask questions and work at a steady pace. Each lesson closes with practical feedback and a small next step.`,
  };
}
