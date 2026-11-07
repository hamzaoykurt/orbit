// Placement test question bank (CEFR A1-B2). The correct answers stay on the server; the client only ever sees
// `prompt`, `text` and `options`. Six items per level: the staircase can stay on one level for several steps.
export type PlacementItem = {
  id: string; level: 'A1' | 'A2' | 'B1' | 'B2'; kind: 'read' | 'gap' | 'say';
  /** Reading passage (kind "read" only). */
  text?: string;
  /** The question, the sentence with ___ , or the Turkish sentence to be said in English. */
  prompt: string;
  options: string[]; answer: number;
};

export const PLACEMENT_BANK: PlacementItem[] = [
  // A1
  { id: 'pl-a1-r1', level: 'A1', kind: 'read', text: 'Anna lives in London. She works in a shop. She goes to work by bus.', prompt: 'How does Anna go to work?', options: ['By car', 'By bus', 'On foot'], answer: 1 },
  { id: 'pl-a1-r2', level: 'A1', kind: 'read', text: 'It is Monday. Ben has English at nine o\'clock and music at ten.', prompt: 'What does Ben have at ten o\'clock?', options: ['Music', 'English', 'Lunch'], answer: 0 },
  { id: 'pl-a1-g1', level: 'A1', kind: 'gap', prompt: 'She ___ a teacher.', options: ['am', 'are', 'is'], answer: 2 },
  { id: 'pl-a1-g2', level: 'A1', kind: 'gap', prompt: 'I ___ two brothers.', options: ['have', 'has', 'is'], answer: 0 },
  { id: 'pl-a1-s1', level: 'A1', kind: 'say', prompt: 'Adın ne?', options: ['Where is your name?', 'How old is your name?', 'What is your name?'], answer: 2 },
  { id: 'pl-a1-s2', level: 'A1', kind: 'say', prompt: 'Ben okula gidiyorum.', options: ['I go to school.', 'I goes to school.', 'I am go to school.'], answer: 0 },
  // A2
  { id: 'pl-a2-r1', level: 'A2', kind: 'read', text: 'Last Saturday Maria visited her grandmother. They cooked soup together and watched a film. Maria went home at nine.', prompt: 'What did Maria and her grandmother do?', options: ['They went shopping.', 'They played football.', 'They cooked and watched a film.'], answer: 2 },
  { id: 'pl-a2-r2', level: 'A2', kind: 'read', text: 'The café is open from 8 a.m. to 6 p.m. on weekdays, but on Sundays it closes at 2 p.m.', prompt: 'When does the café close on Sundays?', options: ['At 2 p.m.', 'At 6 p.m.', 'At 8 a.m.'], answer: 0 },
  { id: 'pl-a2-g1', level: 'A2', kind: 'gap', prompt: 'I haven\'t seen him ___ Monday.', options: ['for', 'from', 'since'], answer: 2 },
  { id: 'pl-a2-g2', level: 'A2', kind: 'gap', prompt: 'If it rains tomorrow, we ___ at home.', options: ['will stay', 'stay', 'stayed'], answer: 0 },
  { id: 'pl-a2-s1', level: 'A2', kind: 'say', prompt: 'Dün akşam arkadaşlarımla sinemaya gittim.', options: ['Yesterday evening I go to the cinema with my friends.', 'Yesterday evening I went to the cinema with my friends.', 'Yesterday evening I have gone cinema with friends.'], answer: 1 },
  { id: 'pl-a2-s2', level: 'A2', kind: 'say', prompt: 'Bu çantanın fiyatı ne kadar?', options: ['How much is this bag?', 'How many is this bag?', 'What is the price of this bag cost?'], answer: 0 },
  // B1
  { id: 'pl-b1-r1', level: 'B1', kind: 'read', text: 'Tom used to drive to work, but the traffic was so bad that he now takes the train. It takes a little longer, but he can read during the journey and arrives less stressed.', prompt: 'Why does Tom prefer the train?', options: ['It is faster than driving.', 'He can read and arrives less stressed.', 'The tickets are cheaper than petrol.'], answer: 1 },
  { id: 'pl-b1-r2', level: 'B1', kind: 'read', text: 'Although the hotel was far from the centre, the guests did not mind. The rooms were spotless, and the staff helped them plan day trips.', prompt: 'Why did the guests not mind the distance?', options: ['The hotel was very cheap.', 'A bus ran to the centre every ten minutes.', 'The rooms were very clean and the staff were helpful.'], answer: 2 },
  { id: 'pl-b1-g1', level: 'B1', kind: 'gap', prompt: 'She asked me where ___.', options: ['did I live', 'I lived', 'do I live'], answer: 1 },
  { id: 'pl-b1-g2', level: 'B1', kind: 'gap', prompt: 'I wish I ___ more free time.', options: ['had', 'have', 'will have'], answer: 0 },
  { id: 'pl-b1-s1', level: 'B1', kind: 'say', prompt: 'Toplantıya geç kaldığım için özür dilerim.', options: ['I\'m sorry to be late of the meeting.', 'I\'m sorry that I am late at meeting.', 'I\'m sorry for being late to the meeting.'], answer: 2 },
  { id: 'pl-b1-s2', level: 'B1', kind: 'say', prompt: 'Bana bu konuda yardım edebilir misin?', options: ['Could you give me a hand with this?', 'Can you help me about this?', 'Can you help to me with it?'], answer: 0 },
  // B2
  { id: 'pl-b2-r1', level: 'B2', kind: 'read', text: 'Despite the initial scepticism of investors, the start-up\'s decision to reduce its product range turned out to be a turning point: by focusing on two items, it cut costs by a third and doubled its customer satisfaction scores within a year.', prompt: 'What does the passage suggest about the decision?', options: ['It improved results despite early doubts.', 'It disappointed investors for a whole year.', 'It increased the number of products on sale.'], answer: 0 },
  { id: 'pl-b2-r2', level: 'B2', kind: 'read', text: 'Critics argue that the new law, while well-intentioned, may have unintended consequences: small businesses, which lack the resources to comply, could be forced to close, ironically harming the very communities the law aims to protect.', prompt: 'What is the critics\' main concern?', options: ['The law is too short to be effective.', 'The law protects only large companies.', 'The law could harm small businesses and the communities it should protect.'], answer: 2 },
  { id: 'pl-b2-g1', level: 'B2', kind: 'gap', prompt: 'Had I known about the delay, I ___ earlier.', options: ['would leave', 'would have left', 'had left'], answer: 1 },
  { id: 'pl-b2-g2', level: 'B2', kind: 'gap', prompt: 'The report, ___ was published last week, has been widely criticised.', options: ['which', 'that', 'what'], answer: 0 },
  { id: 'pl-b2-s1', level: 'B2', kind: 'say', prompt: 'Ne olursa olsun, sana destek olacağım.', options: ['What happens, I will to support you.', 'Whatever it happens, I support you.', 'Whatever happens, I\'ll support you.'], answer: 2 },
  { id: 'pl-b2-s2', level: 'B2', kind: 'say', prompt: 'Bu sorunu çözmek için elimden geleni yapacağım.', options: ['I will do my possible for solve this problem.', 'I\'ll do my best to solve this problem.', 'I\'ll make my best solving this problem.'], answer: 1 },
];
