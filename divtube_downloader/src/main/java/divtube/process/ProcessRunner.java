package divtube.process;

import divtube.download.DownloadProgressListener;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Level;
import java.util.logging.Logger;

public class ProcessRunner {
    private static final Logger LOG = Logger.getLogger(ProcessRunner.class.getName());

    // P3C Concurrency [Mandatory]: threads must come from a pool, not ad-hoc
    // `new Thread(...)`, and must be named so a stack dump identifies them
    // instead of showing "Thread-7". Cached pool: reader tasks are short-lived
    // and bounded by however many processes are running concurrently.
    private static final ExecutorService READER_POOL =
        Executors.newCachedThreadPool(namedDaemonFactory());

    private static ThreadFactory namedDaemonFactory() {
        AtomicInteger counter = new AtomicInteger(0);
        return runnable -> {
            Thread t = new Thread(runnable, "process-reader-" + counter.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }

    public ProcessResult runSync(String[] command) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(command);
        Process process = pb.start();

        StringBuilder stdOut = new StringBuilder();
        StringBuilder stdErr = new StringBuilder();

        Future<?> outFuture = READER_POOL.submit(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    stdOut.append(line).append("\\n");
                }
            } catch (IOException e) {
                LOG.log(Level.FINE, "stdout reader stopped early", e);
            }
        });

        Future<?> errFuture = READER_POOL.submit(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    stdErr.append(line).append("\\n");
                }
            } catch (IOException e) {
                LOG.log(Level.FINE, "stderr reader stopped early", e);
            }
        });

        int exitCode = process.waitFor();
        try {
            outFuture.get();
            errFuture.get();
        } catch (ExecutionException e) {
            LOG.log(Level.FINE, "reader task failed", e);
        }

        return new ProcessResult(exitCode, stdOut.toString(), stdErr.toString());
    }

    public Process runAsync(String[] command, DownloadProgressListener listener) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true); // merge stderr into stdout for parsing progress
        Process process = pb.start();

        READER_POOL.submit(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    ProcessEventParser.parseDownloadProgress(line, listener);
                }
            } catch (IOException e) {
                LOG.log(Level.FINE, "progress reader stopped early", e);
            }
        });

        return process;
    }
}
