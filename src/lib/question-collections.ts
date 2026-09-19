import collections from "@/data/question-collections.json";

export const QUESTION_COLLECTIONS = collections;

export function getQuestionCollection(id?: string) {
  return QUESTION_COLLECTIONS.find((collection) => collection.id === id);
}
