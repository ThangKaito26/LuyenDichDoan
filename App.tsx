import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppView, SetupTab } from './types';
import type { Feedback, Hint } from './types';
import { generateParagraph, getFeedbackForSentence, getHintForSentence } from './services/geminiService';
import * as Diff from 'diff';

// --- HELPER & UI COMPONENTS (Defined outside main component to prevent re-creation) ---

const SpinnerIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const LightIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
);

const DarkIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
);


interface CircularProgressBarProps {
  score: number;
}

const CircularProgressBar: React.FC<CircularProgressBarProps> = ({ score }) => {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const scoreColor = score >= 80 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="w-full h-full" viewBox="0 0 120 120">
        <circle className="text-gray-300 dark:text-gray-600" strokeWidth="8" stroke="currentColor" fill="transparent" r={radius} cx="60" cy="60" />
        <circle
          className={`${scoreColor} transition-all duration-1000 ease-out`}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className={`absolute text-3xl font-bold ${scoreColor}`}>{score}</span>
    </div>
  );
};

interface DiffViewerProps {
  userInput: string;
  correctTranslation: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ userInput, correctTranslation }) => {
    const diffResult = Diff.diffChars(userInput, correctTranslation);

    return (
        <div className="space-y-3">
            <div>
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Bản dịch của bạn:</p>
                <div className="text-base leading-relaxed p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                    {diffResult.map((part, index) => {
                        if (part.added) return null;
                        if (part.removed) {
                            return <span key={index} className="bg-red-500/20 text-red-700 dark:text-red-400 rounded px-1 line-through">{part.value}</span>;
                        }
                        return <span key={index}>{part.value}</span>;
                    })}
                </div>
            </div>
            <div>
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Bản dịch đúng:</p>
                <div className="text-base leading-relaxed p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                    {diffResult.map((part, index) => {
                        if (part.removed) return null;
                        if (part.added) {
                            return <span key={index} className="bg-green-500/20 text-green-700 dark:text-green-300 rounded px-1">{part.value}</span>;
                        }
                        return <span key={index}>{part.value}</span>;
                    })}
                </div>
            </div>
        </div>
    );
};


const getErrorColor = (type: string) => {
  const lowerType = type.toLowerCase();
  if (lowerType.includes('ngữ pháp') || lowerType.includes('grammar')) return 'bg-red-500';
  if (lowerType.includes('từ vựng') || lowerType.includes('vocabulary')) return 'bg-blue-500';
  if (lowerType.includes('cấu trúc') || lowerType.includes('structure')) return 'bg-yellow-500';
  return 'bg-gray-500';
};

const App: React.FC = () => {
    const [darkMode, setDarkMode] = useState(false);
    const [view, setView] = useState<AppView>(AppView.Setup);
    const [setupTab, setSetupTab] = useState<SetupTab>(SetupTab.AI);
    const [topic, setTopic] = useState<string>("kỳ nghỉ hè ở bãi biển");
    const [userParagraph, setUserParagraph] = useState<string>("");
    const [vietnameseParagraph, setVietnameseParagraph] = useState<string>("");
    const [sentences, setSentences] = useState<string[]>([]);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
    const [userTranslation, setUserTranslation] = useState<string>("");
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [hint, setHint] = useState<Hint[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [practiceHistory, setPracticeHistory] = useState<Record<number, Feedback>>({});

    useEffect(() => {
        const isDark = localStorage.getItem('theme') === 'dark' || 
                       (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setDarkMode(isDark);
        if (isDark) {
            document.documentElement.classList.add('dark');
        }
    }, []);

    const toggleDarkMode = () => {
        setDarkMode(prev => {
            const newMode = !prev;
            if (newMode) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
            return newMode;
        });
    };

    const handleStartPractice = useCallback((paragraph: string) => {
        const processedSentences = paragraph.match(/[^.?!]+[.?!]*/g) || [];
        if (processedSentences.length > 0) {
            setVietnameseParagraph(paragraph);
            setSentences(processedSentences);
            setCurrentSentenceIndex(0);
            setUserTranslation("");
            setFeedback(null);
            setHint(null);
            setError(null);
            setPracticeHistory({});
            setView(AppView.Practice);
        } else {
            setError("Đoạn văn không hợp lệ hoặc không chứa câu nào.");
        }
    }, []);

    const handleStartWithAI = async () => {
        if (!topic.trim()) {
            setError("Vui lòng nhập chủ đề.");
            return;
        }
        setIsLoading(true);
        setLoadingMessage("AI đang sáng tạo đoạn văn...");
        setError(null);
        try {
            const paragraph = await generateParagraph(topic);
            handleStartPractice(paragraph);
        } catch (err) {
            setError("Không thể tạo đoạn văn. Vui lòng thử lại.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCheck = async () => {
        if (!userTranslation.trim()) {
            setError("Vui lòng nhập bản dịch của bạn.");
            return;
        }
        setIsLoading(true);
        setLoadingMessage("AI đang chấm điểm...");
        setError(null);
        setHint(null);
        try {
            const result = await getFeedbackForSentence(sentences[currentSentenceIndex], userTranslation);
            setFeedback(result);
            setPracticeHistory(prev => ({
                ...prev,
                [currentSentenceIndex]: result
            }));
        } catch (err) {
            setError("Không thể nhận phản hồi. Vui lòng thử lại.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGetHint = async () => {
        setIsLoading(true);
        setLoadingMessage("AI đang tìm gợi ý...");
        setError(null);
        try {
            const result = await getHintForSentence(sentences[currentSentenceIndex]);
            setHint(result);
        } catch (err) {
            setError("Không thể nhận gợi ý. Vui lòng thử lại.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNextSentence = () => {
        if (currentSentenceIndex < sentences.length - 1) {
            setCurrentSentenceIndex(prev => prev + 1);
            setUserTranslation("");
            setFeedback(null);
            setHint(null);
            setError(null);
        } else {
            // End of practice
            setView(AppView.Setup);
            // Optionally reset all state here
        }
    };

    const currentVietnameseSentence = useMemo(() => {
        return sentences[currentSentenceIndex] || "";
    }, [sentences, currentSentenceIndex]);
    
    const isPracticeFinished = useMemo(() => currentSentenceIndex >= sentences.length -1, [currentSentenceIndex, sentences]);

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8 transition-colors duration-300">
            <div className="max-w-7xl mx-auto">
                <header className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                        English Mastery Hub
                        <span className="block text-base font-medium text-gray-500 dark:text-gray-400">Luyện Viết Đoạn với AI</span>
                    </h1>
                    <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        {darkMode ? <LightIcon /> : <DarkIcon />}
                    </button>
                </header>

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
                        <strong className="font-bold">Lỗi!</strong>
                        <span className="block sm:inline ml-2">{error}</span>
                    </div>
                )}

                {view === AppView.Setup && (
                    <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-lg max-w-2xl mx-auto animate-fade-in">
                        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
                            <button onClick={() => setSetupTab(SetupTab.AI)} className={`px-4 py-3 font-semibold transition-colors ${setupTab === SetupTab.AI ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                                AI Tạo Đoạn Văn
                            </button>
                            <button onClick={() => setSetupTab(SetupTab.User)} className={`px-4 py-3 font-semibold transition-colors ${setupTab === SetupTab.User ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                                Tự Nhập Đoạn Văn
                            </button>
                        </div>

                        {setupTab === SetupTab.AI ? (
                            <div className="space-y-4">
                                <label htmlFor="topic-input" className="block text-lg font-medium">Nhập chủ đề bạn muốn luyện tập:</label>
                                <input id="topic-input" type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ví dụ: gia đình, du lịch, công nghệ..." className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" />
                                <button onClick={handleStartWithAI} disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 transition-colors">
                                    {isLoading ? <><SpinnerIcon /> {loadingMessage}</> : "Bắt đầu Luyện viết"}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <label htmlFor="paragraph-input" className="block text-lg font-medium">Dán đoạn văn tiếng Việt của bạn vào đây:</label>
                                <textarea id="paragraph-input" value={userParagraph} onChange={e => setUserParagraph(e.target.value)} rows={8} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" placeholder="Nhập hoặc dán đoạn văn tiếng Việt..."></textarea>
                                <button onClick={() => handleStartPractice(userParagraph)} disabled={!userParagraph.trim()} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">
                                    Bắt đầu Luyện viết
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {view === AppView.Practice && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                        {/* Left Panel */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col" style={{maxHeight: 'calc(100vh - 10rem)', minHeight: '500px'}}>
                            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                                <h2 className="text-xl font-bold text-blue-600 dark:text-blue-400">Đoạn văn gốc</h2>
                                <span className="text-sm font-semibold bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full">{currentSentenceIndex + 1} / {sentences.length}</span>
                            </div>
                            <div className="text-lg leading-relaxed p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg flex-grow overflow-y-auto mb-4">
                                {sentences.map((sentence, index) => {
                                    const historyItem = practiceHistory[index];
                                    if (historyItem && index < currentSentenceIndex) {
                                        return (
                                            <span key={index} className="text-green-700 dark:text-green-400 italic">
                                                {historyItem.correct_translation}{' '}
                                            </span>
                                        );
                                    }
                                    return (
                                        <span key={index} className={index === currentSentenceIndex ? 'current-sentence font-semibold transition-colors duration-300' : ''}>
                                            {sentence}{' '}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="mb-4 flex-shrink-0">
                                <label htmlFor="user-translation-input" className="block text-lg font-medium mb-2">Bản dịch của bạn:</label>
                                <textarea id="user-translation-input" value={userTranslation} onChange={e => setUserTranslation(e.target.value)} rows={5} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" placeholder="Nhập bản dịch tiếng Anh của bạn cho câu được tô sáng..."></textarea>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 pt-4 flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
                                {!feedback && <button onClick={handleGetHint} disabled={isLoading} className="w-full sm:w-auto flex-1 flex justify-center items-center gap-2 bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-yellow-600 disabled:bg-yellow-300 transition-colors">💡 Gợi ý</button>}
                                <button onClick={handleCheck} disabled={isLoading} className="w-full sm:w-auto flex-1 flex justify-center items-center gap-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 transition-colors">
                                    {isLoading && loadingMessage === "AI đang chấm điểm..." ? <><SpinnerIcon/> Đang chấm...</> : "Kiểm tra"}
                                </button>
                                {feedback && (
                                     <button onClick={handleNextSentence} className={`w-full sm:w-auto flex-1 bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors`}>
                                        {isPracticeFinished ? "Hoàn thành" : "Câu tiếp theo"}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Right Panel */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg flex flex-col">
                           <h2 className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-4">Phản hồi từ AI</h2>
                            {isLoading && !feedback ? (
                                <div className="flex-grow flex flex-col items-center justify-center text-center">
                                    <SpinnerIcon className="w-12 h-12 text-blue-500 mb-4" />
                                    <p className="text-lg font-semibold">{loadingMessage}</p>
                                    <p className="text-gray-500 dark:text-gray-400">Vui lòng chờ trong giây lát...</p>
                                </div>
                            ) : feedback ? (
                                <div className="space-y-6 animate-fade-in">
                                    <div className="flex flex-col items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <h3 className="text-lg font-semibold">Điểm chính xác</h3>
                                        <CircularProgressBar score={feedback.accuracy_score} />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold">So sánh bản dịch</h3>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                          <DiffViewer userInput={userTranslation} correctTranslation={feedback.correct_translation} />
                                        </div>
                                    </div>
                                    {feedback.errors && feedback.errors.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-lg font-semibold">Lỗi cần sửa</h3>
                                            <ul className="space-y-3">
                                                {feedback.errors.map((err, i) => (
                                                    <li key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                        <span className={`flex-shrink-0 mt-1 w-3 h-3 rounded-full ${getErrorColor(err.type)}`}></span>
                                                        <div>
                                                            <strong className="font-semibold">{err.type}: </strong>
                                                            <span>{err.explanation}</span>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                      <h3 className="text-lg font-semibold">Nhận xét chung</h3>
                                      <p className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-base italic">"{feedback.general_feedback}"</p>
                                    </div>
                                </div>
                            ) : hint ? (
                                <div className="animate-fade-in space-y-3">
                                     <h3 className="text-lg font-semibold">Gợi ý từ vựng</h3>
                                     <ul className="space-y-2">
                                        {hint.map((h, i) => (
                                            <li key={i} className="flex justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                <span className="font-semibold text-blue-600 dark:text-blue-400">{h.english_word}</span>
                                                <span className="text-gray-600 dark:text-gray-300">{h.vietnamese_meaning}</span>
                                            </li>
                                        ))}
                                     </ul>
                                </div>
                            ) : (
                                <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    <p className="text-lg font-semibold">Chờ bạn thực hành</p>
                                    <p>Phản hồi chi tiết sẽ xuất hiện ở đây sau khi bạn kiểm tra bản dịch.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
