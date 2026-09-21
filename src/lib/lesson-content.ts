export type LessonCheck = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type LessonDefinition = {
  domain: string;
  section: "Reading & Writing" | "Math";
  description: string;
  skills: string[];
  method: { title: string; detail: string }[];
  example: {
    label: string;
    prompt: string;
    steps: string[];
    answer: string;
  };
  traps: { title: string; detail: string }[];
  checks: LessonCheck[];
};

export const LESSONS: Record<string, LessonDefinition> = {
  "Expression of Ideas": {
    domain: "Expression of Ideas",
    section: "Reading & Writing",
    description: "Revise a passage so its ideas connect logically and accomplish a precise rhetorical goal.",
    skills: ["Rhetorical Synthesis", "Transitions"],
    method: [
      { title: "Name the job", detail: "Read the question stem first. Turn the goal into a command: compare, introduce, emphasize a difference, or support a claim." },
      { title: "Select only useful notes", detail: "For synthesis questions, cross out details that do not directly serve that command. Accuracy is necessary; relevance wins." },
      { title: "Predict the relationship", detail: "Before reading transition choices, decide whether the next sentence adds, contrasts, causes, illustrates, or concludes." },
      { title: "Test precision and flow", detail: "Choose the concise answer that fulfills the goal without adding an unsupported claim or changing the relationship." },
    ],
    example: {
      label: "Worked example · rhetorical synthesis",
      prompt: "Notes: The city planted drought-tolerant trees in 2018. Water use in its parks fell 18% by 2022. Goal: emphasize the result of the city's decision.",
      steps: [
        "The goal asks for a result, so both the decision and its measurable outcome matter.",
        "The date is useful only to establish the sequence; no extra background is needed.",
        "Use a cause-and-result connection, not a contrast.",
      ],
      answer: "After the city planted drought-tolerant trees in 2018, water use in its parks fell 18% by 2022.",
    },
    traps: [
      { title: "True but irrelevant", detail: "An option can repeat a note accurately and still fail the stated goal." },
      { title: "Transition by vibe", detail: "Words such as “however” and “therefore” are logical operators. Decide the relationship before choosing one." },
      { title: "Invented connection", detail: "Do not turn correlation into causation or add praise, criticism, or certainty absent from the notes." },
    ],
    checks: [
      {
        question: "Sentence 1 says a material is inexpensive. Sentence 2 says it is difficult to recycle. Which transition best begins sentence 2?",
        options: ["Similarly,", "However,", "For example,", "Therefore,"],
        answer: 1,
        explanation: "The second fact complicates the first, so the relationship is contrast: “However.”",
      },
      {
        question: "Notes: Maya Lin designed the Vietnam Veterans Memorial. She was an architecture student when her design was selected. Goal: emphasize how early in her career the selection occurred. Which answer best serves the goal?",
        options: [
          "Maya Lin designed the Vietnam Veterans Memorial.",
          "The Vietnam Veterans Memorial was designed by Maya Lin, an architect.",
          "While still an architecture student, Maya Lin was selected to design the Vietnam Veterans Memorial.",
          "Maya Lin studied architecture and designed a memorial.",
        ],
        answer: 2,
        explanation: "Only the third choice foregrounds that Lin was still a student, directly fulfilling the rhetorical goal.",
      },
      {
        question: "A paragraph gives three examples and the final sentence states the general lesson they demonstrate. Which transition best starts the final sentence?",
        options: ["In contrast,", "Overall,", "Meanwhile,", "For instance,"],
        answer: 1,
        explanation: "“Overall” signals a conclusion or synthesis drawn from the examples.",
      },
    ],
  },
  "Information and Ideas": {
    domain: "Information and Ideas",
    section: "Reading & Writing",
    description: "Find what a text states, what it strongly implies, and which evidence best supports a claim.",
    skills: ["Central Ideas and Details", "Inferences", "Command of Evidence"],
    method: [
      { title: "Read for structure", detail: "Track the topic, the author’s main claim, and the role of each sentence. Do not try to memorize every detail." },
      { title: "Answer before choices", detail: "Restate the central idea or inference in plain language, then match it to an option." },
      { title: "Demand textual proof", detail: "A valid inference must be supported by specific words, numbers, or trends—not outside knowledge." },
      { title: "Match scope", detail: "Reject answers that are broader, stronger, or more absolute than the passage or graph." },
    ],
    example: {
      label: "Worked example · inference",
      prompt: "A study finds that seedlings exposed to moderate wind develop thicker stems than sheltered seedlings, while very strong wind damages growth. What is most reasonably inferred?",
      steps: ["Moderate and strong wind have different effects.", "The evidence supports a qualified, not absolute, conclusion.", "Avoid claiming that all wind improves growth."],
      answer: "Some wind exposure may strengthen seedlings, but the effect depends on intensity.",
    },
    traps: [
      { title: "Half-right answer", detail: "An option may repeat one detail but miss the passage’s central relationship." },
      { title: "Extreme language", detail: "Words such as always, proves, and completely require equally strong evidence." },
      { title: "Graph mismatch", detail: "Check labels, units, and direction before connecting a visual trend to the text." },
    ],
    checks: [
      { question: "A passage presents benefits and limitations of a new battery design. Which central idea is best?", options: ["The design is perfect.", "The design is promising but still has practical constraints.", "All batteries have limitations.", "The inventor dislikes older batteries."], answer: 1, explanation: "The answer preserves both sides of the passage without overstating either." },
      { question: "A graph rises from 20 to 30 units while the text claims an increase. What evidence most directly supports the claim?", options: ["The graph has two axes.", "The value rose by 10 units.", "The study used a graph.", "Thirty is a large number."], answer: 1, explanation: "The measured 10-unit rise directly supports the claim of an increase." },
      { question: "Which choice is safest for an inference question?", options: ["A claim that could be true", "A claim supported by multiple details in the text", "A claim based on common knowledge", "The most surprising claim"], answer: 1, explanation: "SAT inferences must be grounded in the supplied text, not merely plausible." },
    ],
  },
  "Craft and Structure": {
    domain: "Craft and Structure",
    section: "Reading & Writing",
    description: "Determine meaning in context, explain why a sentence is present, and connect two texts precisely.",
    skills: ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
    method: [
      { title: "Use the local context", detail: "For vocabulary, replace the tested word with your own simple prediction using the surrounding contrast, example, or cause." },
      { title: "Describe function, not topic", detail: "A sentence’s purpose is what it does: introduces a claim, provides evidence, qualifies, contrasts, or gives an example." },
      { title: "Map each text separately", detail: "For paired texts, write a five-word summary of each author’s claim before comparing them." },
      { title: "Choose exact agreement", detail: "Two authors may agree on one point while differing elsewhere. Match only the relationship supported by both texts." },
    ],
    example: {
      label: "Worked example · words in context",
      prompt: "The researcher called the early result “tentative,” noting that the sample was small and further trials were needed.",
      steps: ["The explanation signals uncertainty.", "Predict: preliminary or not yet confirmed.", "Reject meanings related to reluctance or physical weakness."],
      answer: "In this context, “tentative” most nearly means provisional.",
    },
    traps: [
      { title: "Dictionary-first thinking", detail: "The correct meaning is the one that fits this sentence, not the word’s most familiar definition." },
      { title: "Topic instead of purpose", detail: "“Discusses bees” names content; “provides an example supporting the claim” names function." },
      { title: "Blending the texts", detail: "Keep each author’s position separate until the final comparison." },
    ],
    checks: [
      { question: "A sentence supplies a specific experiment immediately after a broad claim. What is its most likely function?", options: ["To contradict the claim", "To exemplify evidence for the claim", "To introduce an unrelated topic", "To summarize the whole passage"], answer: 1, explanation: "A specific experiment following a general claim typically functions as supporting evidence or an example." },
      { question: "In context, “reserved” describes a scientist who avoids making a strong claim before more data arrive. “Reserved” most nearly means", options: ["booked", "restrained", "stored", "isolated"], answer: 1, explanation: "The context points to restraint or caution in making the claim." },
      { question: "Text 1 supports a policy; Text 2 agrees with its goal but doubts its cost. The authors would most likely agree that", options: ["the policy is inexpensive", "the goal is worthwhile", "the policy should be rejected", "cost is irrelevant"], answer: 1, explanation: "The shared ground is the goal; they differ about feasibility and cost." },
    ],
  },
  "Standard English Conventions": {
    domain: "Standard English Conventions",
    section: "Reading & Writing",
    description: "Edit sentence boundaries, punctuation, agreement, modifiers, and verb forms using repeatable grammar rules.",
    skills: ["Boundaries", "Form, Structure, and Sense"],
    method: [
      { title: "Find the sentence cores", detail: "Identify each subject–verb pair and decide whether each side can stand alone as a complete sentence." },
      { title: "Choose legal punctuation", detail: "Join two complete sentences with a period, semicolon, or comma plus coordinating conjunction—not a comma alone." },
      { title: "Match the controlling noun", detail: "Ignore interrupting phrases when checking subject–verb and pronoun agreement." },
      { title: "Place modifiers beside targets", detail: "An opening description must logically modify the noun immediately following the comma." },
    ],
    example: {
      label: "Worked example · boundaries",
      prompt: "The telescope gathered data for six months ___ the team then compared the results with earlier observations.",
      steps: ["Both sides contain a subject and a finite verb.", "Both sides are complete sentences.", "A comma alone is illegal; a semicolon can join them."],
      answer: "Use a semicolon: “six months; the team…”",
    },
    traps: [
      { title: "Punctuation by pause", detail: "Sound is unreliable. Classify the clauses first, then select punctuation." },
      { title: "Nearby-noun agreement", detail: "The verb agrees with the true subject, not the closest noun." },
      { title: "Dangling modifier", detail: "After an introductory modifier, ask who or what actually performs the described action." },
    ],
    checks: [
      { question: "Choose the correct boundary: “The sample was small ___ the pattern was consistent.”", options: [", however,", "; however,", ",", ": because"], answer: 1, explanation: "Two independent clauses need a semicolon before the conjunctive adverb and a comma after it." },
      { question: "Choose the correct verb: “The collection of fossils ___ in the museum.”", options: ["remain", "remains", "are remaining", "have remained"], answer: 1, explanation: "The singular subject is “collection”; “of fossils” is only a prepositional phrase." },
      { question: "Which sentence has a logical modifier?", options: ["Walking to class, the rain soaked Nia.", "Walking to class, Nia was soaked by rain.", "Walking to class, the backpack felt heavy to Nia.", "Walking to class, there was rain."], answer: 1, explanation: "Nia is the person walking, and her name appears immediately after the modifier." },
    ],
  },
  Algebra: {
    domain: "Algebra",
    section: "Math",
    description: "Translate, solve, and interpret linear equations, inequalities, functions, and systems.",
    skills: ["Linear equations", "Linear functions", "Systems", "Linear inequalities"],
    method: [
      { title: "Define the unknown", detail: "Write what each variable represents, including units, before building an equation." },
      { title: "Translate relationships", detail: "Rate becomes slope, starting value becomes intercept, and constraints become equations or inequalities." },
      { title: "Solve strategically", detail: "Simplify first. For systems, use substitution when a variable is isolated and elimination when coefficients align." },
      { title: "Interpret in context", detail: "Return to the question: it may ask for a coefficient, coordinate, rate, or expression—not merely x." },
    ],
    example: {
      label: "Worked example · linear model",
      prompt: "A service charges a $12 starting fee plus $4 per hour. Write the total cost C after h hours and find the cost for 5 hours.",
      steps: ["Starting fee = y-intercept 12.", "Hourly rate = slope 4.", "Model: $C=4h+12$; substitute $h=5$."],
      answer: "$C=4(5)+12=32$, so the cost is $32$.",
    },
    traps: [
      { title: "Slope/intercept swap", detail: "The repeating rate multiplies the input; the one-time starting amount stands alone." },
      { title: "Wrong requested value", detail: "If the question asks for $2x$ or an intercept, do not stop at x." },
      { title: "Inequality reversal", detail: "Reverse the inequality only when multiplying or dividing both sides by a negative number." },
    ],
    checks: [
      { question: "For $f(x)=3x-7$, what does 3 represent?", options: ["The x-intercept", "The rate of change", "The initial value", "The output when x=3"], answer: 1, explanation: "In $y=mx+b$, m is the slope or rate of change." },
      { question: "Solve: $5x+2=3x+14$", options: ["4", "6", "8", "12"], answer: 1, explanation: "Subtract $3x$ and 2: $2x=12$, so $x=6$." },
      { question: "A system of two lines has no solution when the lines have", options: ["different slopes", "the same slope and different intercepts", "the same intercept", "one intersection"], answer: 1, explanation: "Equal slopes with different intercepts describe distinct parallel lines." },
    ],
  },
  "Advanced Math": {
    domain: "Advanced Math",
    section: "Math",
    description: "Use structure to rewrite and solve quadratic, exponential, polynomial, rational, radical, and absolute-value expressions.",
    skills: ["Equivalent expressions", "Nonlinear equations", "Nonlinear functions", "Systems"],
    method: [
      { title: "Identify the family", detail: "Look for squared variables, repeated factors, exponents, radicals, or variables in denominators." },
      { title: "Choose a revealing form", detail: "Factored form shows zeros, vertex form shows extrema, and exponential form shows growth or decay." },
      { title: "Preserve restrictions", detail: "Track denominator exclusions, even-root conditions, and possible extraneous solutions." },
      { title: "Verify", detail: "Substitute solutions into the original equation, especially after squaring or clearing denominators." },
    ],
    example: {
      label: "Worked example · quadratic structure",
      prompt: "Solve $x^2-5x+6=0$.",
      steps: ["Find two numbers whose product is 6 and sum is -5.", "They are -2 and -3.", "Factor: $(x-2)(x-3)=0$."],
      answer: "$x=2$ or $x=3$.",
    },
    traps: [
      { title: "Lost solutions", detail: "When a product is zero, set every factor equal to zero." },
      { title: "Extraneous roots", detail: "Squaring can create solutions that fail in the original radical equation." },
      { title: "Form blindness", detail: "Do not expand automatically; the question may become easier in factored or vertex form." },
    ],
    checks: [
      { question: "What are the zeros of $y=(x+4)(x-1)$?", options: ["-4 and 1", "4 and -1", "-4 and -1", "4 and 1"], answer: 0, explanation: "Set each factor to zero: $x=-4$ and $x=1$." },
      { question: "In $y=2(1.05)^t$, 1.05 indicates", options: ["5% decay", "5% growth", "105% growth each period", "an initial value of 1.05"], answer: 1, explanation: "$1.05=1+0.05$, so the quantity grows 5% per period." },
      { question: "Which form most directly reveals the vertex?", options: ["$ax^2+bx+c$", "$a(x-h)^2+k$", "$a(x-r_1)(x-r_2)$", "$mx+b$"], answer: 1, explanation: "Vertex form $a(x-h)^2+k$ reveals the vertex $(h,k)$." },
    ],
  },
  "Problem-Solving and Data Analysis": {
    domain: "Problem-Solving and Data Analysis",
    section: "Math",
    description: "Reason with units, ratios, percentages, probability, data displays, studies, and statistical claims.",
    skills: ["Rates and units", "Percentages", "Data", "Probability", "Statistical inference"],
    method: [
      { title: "Write units everywhere", detail: "Units reveal whether to multiply or divide and expose invalid answers before calculation." },
      { title: "Choose the correct base", detail: "Percent change is $(new-old)/old$. The original amount is always the denominator." },
      { title: "Read the display literally", detail: "Check axes, scale, sample size, center, spread, and whether the question asks for a count or percent." },
      { title: "Respect study design", detail: "Random selection supports generalization; random assignment supports causal conclusions." },
    ],
    example: {
      label: "Worked example · percent change",
      prompt: "A price rises from $80 to $92. What is the percent increase?",
      steps: ["Change: $92-80=12$.", "Original value: 80.", "$12/80=0.15$."],
      answer: "The price increased by 15%.",
    },
    traps: [
      { title: "Wrong denominator", detail: "Percent change divides by the original value, not the new value." },
      { title: "Percent vs percentage points", detail: "A rate moving from 20% to 25% rises 5 percentage points but 25 percent." },
      { title: "Causation leap", detail: "An observational association does not by itself establish cause and effect." },
    ],
    checks: [
      { question: "A value falls from 50 to 40. What is the percent decrease?", options: ["10%", "20%", "25%", "40%"], answer: 1, explanation: "The decrease is 10; $10/50=0.20=20\%$." },
      { question: "Which design best supports a causal conclusion?", options: ["A voluntary survey", "An observational study", "A randomized experiment", "A larger graph"], answer: 2, explanation: "Random assignment in an experiment helps isolate the treatment’s causal effect." },
      { question: "If 30 of 120 students choose an option, what proportion chose it?", options: ["0.20", "0.25", "0.30", "0.40"], answer: 1, explanation: "$30/120=1/4=0.25$." },
    ],
  },
  "Geometry and Trigonometry": {
    domain: "Geometry and Trigonometry",
    section: "Math",
    description: "Model figures with area, volume, angles, similarity, right-triangle trigonometry, and circle relationships.",
    skills: ["Area and volume", "Lines and angles", "Triangles", "Trigonometry", "Circles"],
    method: [
      { title: "Draw and label", detail: "Transfer every length, angle, and relationship to a clean diagram; mark what must be found." },
      { title: "Find the governing relationship", detail: "Use similarity, the Pythagorean theorem, SOH-CAH-TOA, or a circle theorem before substituting numbers." },
      { title: "Track scale and dimensions", detail: "Lengths scale by k, areas by $k^2$, and volumes by $k^3$. Keep units consistent." },
      { title: "Estimate and verify", detail: "Check that an angle, length, area, or volume is geometrically reasonable." },
    ],
    example: {
      label: "Worked example · right triangle",
      prompt: "A right triangle has legs 6 and 8. Find its hypotenuse.",
      steps: ["Use $a^2+b^2=c^2$.", "$6^2+8^2=36+64=100$.", "$c=\sqrt{100}$."],
      answer: "The hypotenuse is 10.",
    },
    traps: [
      { title: "Diameter/radius confusion", detail: "Circle formulas use the radius unless the formula explicitly says otherwise." },
      { title: "Linear scale for area", detail: "Doubling every length multiplies area by 4 and volume by 8." },
      { title: "Wrong trig ratio", detail: "Label opposite, adjacent, and hypotenuse relative to the angle named in the question." },
    ],
    checks: [
      { question: "A circle has diameter 10. What is its area?", options: ["$10\pi$", "$20\pi$", "$25\pi$", "$100\pi$"], answer: 2, explanation: "The radius is 5, so area is $\pi(5)^2=25\pi$." },
      { question: "Similar figures have a length scale factor of 3. Their areas have scale factor", options: ["3", "6", "9", "27"], answer: 2, explanation: "Area scales by the square of the length factor: $3^2=9$." },
      { question: "For angle θ in a right triangle, $\sin θ$ equals", options: ["adjacent/hypotenuse", "opposite/hypotenuse", "opposite/adjacent", "hypotenuse/opposite"], answer: 1, explanation: "SOH: sine is opposite over hypotenuse." },
    ],
  },
};

export const DEFAULT_LESSON = LESSONS.Algebra;

export function lessonForDomain(domain: string | undefined): LessonDefinition {
  return (domain && LESSONS[domain]) || DEFAULT_LESSON;
}
