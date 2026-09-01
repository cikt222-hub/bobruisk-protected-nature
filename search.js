// Алгоритм поиска Левенштейна для исправлений опечаток
function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // замена
                    matrix[i][j - 1] + 1,     // вставка
                    matrix[i - 1][j] + 1      // удаление
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function searchObjects(query, items) {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    return items.map(item => {
        const name = item.name.toLowerCase();
        let score = 0;

        if (name.includes(normalizedQuery)) {
            score = 100; // Точное совпадение части строки
        } else {
            const words = name.split(" ");
            let minDistance = 999;

            words.forEach(word => {
                const dist = getLevenshteinDistance(normalizedQuery, word);
                if (dist < minDistance) minDistance = dist;
            });

                // Если опечаток мало, даем высокий балл
                if (minDistance <= 2) {
                    score = 80 - minDistance * 15;
                }
        }

        return { item, score };
    })
    .filter(res => res.score > 30)
    .sort((a, b) => b.score - a.score)
    .map(res => res.item);
}
