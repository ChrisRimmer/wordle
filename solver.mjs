import { all, solutions, guesses } from "./words.mjs";

export { all, solutions, guesses };

// Utility constants
export const maskCount = 3 ** 5;
export const masks = new Array(maskCount).fill(null).map((_value, i) =>
  i.toString(3).padStart(5, 0).split("")
);

Array.prototype.groupBy = function (groupingFunction = ident) {
  return this.reduce(
	(acc, curr) => {
		const key = groupingFunction(curr)
		if (acc.hasOwnProperty(key)) acc[key].push(curr)
		else acc[key] = [curr]
		return acc
	},
	{}
  )
}

export const getMaskFromGuessAndSolution = (
  guess,
  solution,
) => {
  const splitSolution = solution.split("");
  const splitGuess = guess.split("");

  let solutionCharsTaken = splitSolution.map((_value) => false);
  let statuses = [];

  // handle all correct cases first
  splitGuess.forEach((letter, i) => {
    if (letter === splitSolution[i]) {
      statuses[i] = 2;
      solutionCharsTaken[i] = true;
      return;
    }
  });

  splitGuess.forEach((letter, i) => {
    if (statuses[i] || splitSolution[i] == letter) {
      statuses[i] = 2;
      return;
    }

    if (!splitSolution.includes(letter)) {
      // handles the absent case
      statuses[i] = 0;
      return;
    }

    // now we are left with "present"s
    const indexOfPresentChar = splitSolution.findIndex(
      (x, index) => x === letter && !solutionCharsTaken[index],
    );

    if (indexOfPresentChar > -1) {
      solutionCharsTaken[indexOfPresentChar] = true;
      statuses[i] = 1;
      return;
    } else {
      return;
    }
  });

  return parseInt(statuses.join(""), 3);
};

export const convertMaskToFeedback = (maskID, guess) => {
  const mask = masks[maskID];
  const located = [".", ".", ".", ".", "."];
  const unlocated = [[], [], [], [], []];
  let has = {
    addLetter: function (letter) {
      if (this.letters[letter]) return;
      else {
        this.letters[letter] = {
          min: this.letters[letter] = 0,
          max: this.letters[letter] = 5,
        };
      }
    },
    incLetter: function (letter) {
      if (!this.letters.hasOwnProperty(letter)) this.addLetter(letter);
      this.letters[letter].min++;
    },
    limitLetter: function (letter) {
      if (!this.letters.hasOwnProperty(letter)) this.addLetter(letter);
      this.letters[letter].max = this.letters[letter].min;
    },
    letters: {},
  };

  const splitGuess = guess.split("");

  // handle all correct cases first
  splitGuess.forEach((letter, i) => {
    if (mask[i] == 2) {
      has.incLetter(letter);
      located[i] = letter;
      return;
    }
  });

  splitGuess.forEach((letter, i) => {
    // Skip letters in the correct place
    if (mask[i] == 2) {
      return;
    }

    // Set limits on letters there are no more of
    if (mask[i] == 0) {
      has.limitLetter(letter);
      return;
    }

    if (mask[i] == 1) {
      unlocated[i].push(letter);
      has.incLetter(letter);
      return;
    }
  });

  return { located, unlocated, letters: has.letters };
};

export const getFeedbackFromGuessAndSolution = (guess, solution) =>
  convertMaskToFeedback(getMaskFromGuessAndSolution(guess, solution), guess);

const hasLocated = (word, located) => word.match(new RegExp(located.join("")));
const hasUnlocated = (word, unlocated) =>
  unlocated.every((letter, i) => word[i] != letter);

export const matchesFeedback = ({ located, unlocated, letters }) => (word) =>
  hasLocated(word, located) && hasUnlocated(word, unlocated) &&
  hasLetter(word, letters);
export const matchesMask = (mask, guess) => (solution) =>
  matchesFeedback(convertMaskToFeedback(parseInt(mask, 3), guess))(solution);

export const filterWordsWithFeedback = (words, feedback) =>
  words
    .filter((word) => word.match(new RegExp(feedback.located.join(""))))
    .filter((word) =>
      feedback.unlocated.every((letter, i) => word[i] != letter)
    )
    .filter((word) =>
      Object.entries(feedback.letters)
        .every(
          ([hasLetter, range]) =>
            word.split("").filter((wordLetter) => wordLetter == hasLetter)
                .length >= range.min &&
            word.split("").filter((wordLetter) => wordLetter == hasLetter)
                .length <= range.max,
        )
    );

export const filterWordsWithMask = (words, guess, mask) =>
  filterWordsWithFeedback(
    words,
    convertMaskToFeedback(mask, guess),
  );

export const refineWordsForGuess = (words, guess, solution) =>
  filterWordsWithFeedback(
    words,
    getFeedbackFromGuessAndSolution(guess, solution),
  );

export const getQualityOfMaskForGuess = (solutions, maskID, guess) => {
  const refinedSolutions = filterWordsWithMask(solutions, guess, maskID);
  if (refinedSolutions.length == 0) {
    return { guess, quality: 0 };
  } else {
    const probability = refinedSolutions.length / solutions.length;
    const information = Math.log2(1 / probability);
    return { guess, quality: probability * information };
  }
};

export const getQualityOfGuess = (guess, solutions) => {
  const quality = masks.map(
    (_mask, maskID) => getQualityOfMaskForGuess(solutions, maskID, guess),
  ).reduce(
    (acc, curr) => acc + curr.quality,
    0,
  );
  return quality;
};

export const getBucket = (guess) => (solution) =>
  getMaskFromGuessAndSolution(guess, solution);

const getProp = (propName) => (obj) => obj[propName];
const ident = (obj) => obj;

export const getBucketSizes = (guess, solutions = solutions) =>
  Object.values(
    solutions.map(getBucket(guess)).groupBy(ident),
  ).map(getProp("length"));

export const rateBuckets = (solutions = solutions, bucketSizes) => {
  let quality = 0;
  bucketSizes.forEach((bucketSize) => {
    const probability = bucketSize / solutions.length;
    const information = Math.log2(1 / probability);
    quality += probability * information;
  });

  return quality;
};

export const rateGuess = (allowedSolutions = solutions) => (guess) =>
  rateBuckets(allowedSolutions, getBucketSizes(guess, allowedSolutions)) +
  (allowedSolutions.includes(guess) ? 0.001 : 0);

const getIndexOfLargest = (iMax, x, i, arr) => x > arr[iMax] ? i : iMax;

export const getBestGuess = (allowedSolutions = solutions) =>
  all[all.map(rateGuess(allowedSolutions)).reduce(getIndexOfLargest, 0)];
