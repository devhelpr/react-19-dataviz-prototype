console.log("Worker started");

self.onmessage = function (e) {
  console.log("Worker received message:", e.data);

  const { numRecords } = e.data;
  let progress = 0;

  // Simulate work with progress updates
  const interval = setInterval(() => {
    progress += 1;
    self.postMessage({ type: "progress", progress });

    if (progress >= 100) {
      clearInterval(interval);
      self.postMessage({
        type: "complete",
        data: {
          Column1: Array.from({ length: numRecords }, () => ({
            date: new Date(),
            value: Math.random() * 100,
            category: "A",
          })),
        },
      });
    }
  }, 50);
};
