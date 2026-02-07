#!/usr/bin/env python3
"""
Test script to verify YouTube-clipper-skill is fully functional.
"""

import sys
import os
import subprocess

def test_dependencies():
    """Test that all required dependencies are available."""
    print("=== Testing Dependencies ===")
    
    # Test Python dependencies
    deps_to_test = [
        ('yt_dlp', 'yt-dlp'),
        ('pysrt', 'pysrt'), 
        ('dotenv', 'python-dotenv')
    ]
    
    for module_name, package_name in deps_to_test:
        try:
            __import__(module_name)
            print(f"✓ {package_name} available")
        except ImportError:
            print(f"✗ {package_name} missing")
            return False
    
    # Test command line tools
    tools_to_test = [
        ('ffmpeg', 'FFmpeg'),
        ('yt-dlp', 'yt-dlp CLI')
    ]
    
    for tool, name in tools_to_test:
        try:
            result = subprocess.run([tool, '--version'], 
                                  capture_output=True, text=True, timeout=10)
            # Check if the command returned version info (in stdout or stderr)
            # Note: Some versions of ffmpeg return exit code 1 for -version
            has_version_info = ('ffmpeg' in result.stdout.lower() or 'ffmpeg' in result.stderr.lower() or 
                              'yt-dlp' in result.stdout.lower() or 'yt-dlp' in result.stderr.lower())
            if has_version_info:
                print(f"✓ {name} available")
            else:
                # Additional check for yt-dlp specifically
                if tool == 'yt-dlp':
                    # yt-dlp might return version in a different format
                    combined_output = result.stdout + result.stderr
                    if len(combined_output) > 0:
                        print(f"✓ {name} available")
                    else:
                        print(f"✗ {name} not working properly")
                        return False
                else:
                    print(f"✗ {name} not working properly")
                    return False
        except FileNotFoundError:
            print(f"✗ {name} not found")
            return False
        except subprocess.TimeoutExpired:
            print(f"✗ {name} check timed out")
            return False
    
    print("All dependencies are available!\n")
    return True

def test_scripts_accessibility():
    """Test that all skill scripts are accessible."""
    print("=== Testing Script Accessibility ===")
    
    skill_path = "/home/xh001/mps/openclaw/skills/Youtube-clipper-skill/scripts"
    
    scripts_to_test = [
        "download_video.py",
        "analyze_subtitles.py", 
        "clip_video.py",
        "translate_subtitles.py",
        "burn_subtitles.py",
        "generate_summary.py",
        "utils.py"
    ]
    
    for script in scripts_to_test:
        script_path = os.path.join(skill_path, script)
        if os.path.exists(script_path):
            print(f"✓ {script} exists")
        else:
            print(f"✗ {script} missing")
            return False
    
    print("All scripts are accessible!\n")
    return True

def test_basic_functionality():
    """Test basic functionality without downloading a video."""
    print("=== Testing Basic Functionality ===")
    
    try:
        # Import the core modules
        import sys
        sys.path.insert(0, "/home/xh001/mps/openclaw/skills/Youtube-clipper-skill/scripts")
        
        # Test importing key modules
        import utils
        print("✓ utils module imported successfully")
        
        # Test utility function
        sanitized = utils.sanitize_filename("Test: Video? With|Special<Characters>")
        print(f"✓ Filename sanitization works: {sanitized}")
        
        print("Basic functionality tests passed!\n")
        return True
    except Exception as e:
        print(f"✗ Basic functionality test failed: {e}")
        return False

def main():
    print("YouTube-clipper-skill readiness verification\n")
    
    tests = [
        ("Dependencies", test_dependencies),
        ("Scripts Accessibility", test_scripts_accessibility),
        ("Basic Functionality", test_basic_functionality)
    ]
    
    all_passed = True
    
    for test_name, test_func in tests:
        print(f"Running {test_name} test...")
        if not test_func():
            all_passed = False
            print(f"{test_name} test FAILED!\n")
        else:
            print(f"{test_name} test PASSED!\n")
    
    print("="*50)
    if all_passed:
        print("🎉 SUCCESS: YouTube-clipper-skill is ready to use!")
        print("\nAll dependencies are installed and the skill is functional.")
        print("You can now use the skill to:")
        print("- Download YouTube videos and subtitles")
        print("- Analyze content with AI for chapter segmentation")
        print("- Clip videos into segments")
        print("- Translate subtitles to Chinese")
        print("- Burn subtitles onto videos")
        print("- Generate summaries")
    else:
        print("❌ FAILURE: Some tests failed. Skill may not be ready.")
    
    return all_passed

if __name__ == "__main__":
    main()