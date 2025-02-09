
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Download, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ImageGeneratorProps {
  onGenerationComplete?: () => void;
}

export const ImageGenerator = ({ onGenerationComplete }: ImageGeneratorProps) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const generateImage = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Please enter a prompt",
        description: "Your prompt cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt }
      });

      if (error) throw error;

      setGeneratedImage(data.output[0]);
      
      // Call the callback instead of reloading the page
      if (onGenerationComplete) {
        onGenerationComplete();
      }
      
      toast({
        title: "Image generated successfully!",
        description: "Your image is ready to download.",
      });
    } catch (error: any) {
      if (error.message?.includes('limit reached')) {
        toast({
          title: "Usage limit reached",
          description: (
            <div className="space-y-2">
              <p>You've reached your monthly image generation limit.</p>
              <Button onClick={() => navigate('/pricing')} variant="outline" size="sm">
                Upgrade Plan
              </Button>
            </div>
          ),
          variant: "destructive",
        });
      } else {
        console.error('Error generating image:', error);
        toast({
          title: "Error generating image",
          description: "Please try again later",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async () => {
    if (!generatedImage) return;
    
    try {
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Error downloading image",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <Card className="p-6 glass fade-in">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="prompt">Your Vision</Label>
            <Input
              id="prompt"
              placeholder="An astronaut riding a rainbow unicorn, cinematic, dramatic"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="input-glass"
            />
          </div>

          <Button
            onClick={generateImage}
            disabled={loading || !prompt.trim()}
            className="w-full"
          >
            {loading ? (
              <span className="loading-dots">
                Generating<span>.</span><span>.</span><span>.</span>
              </span>
            ) : (
              <>
                <ImageIcon className="w-4 h-4 mr-2" />
                Generate Image
              </>
            )}
          </Button>
        </div>
      </Card>

      {generatedImage && (
        <Card className="p-6 glass fade-in">
          <div className="space-y-4">
            <div className="aspect-square relative rounded-lg overflow-hidden">
              <img
                src={generatedImage}
                alt="Generated"
                className="w-full h-full object-cover"
              />
            </div>
            <Button onClick={downloadImage} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Image
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ImageGenerator;
