#!/bin/bash
#SBATCH --job-name=SAEs
#SBATCH --output=slurm/logs/slurm_%j.log
#SBATCH --error=slurm/logs/slurm_%j.err
#SBATCH --partition=ug-gpu-small
#SBATCH --gres=gpu:turing:1
#SBATCH --time=5:00:00
#SBATCH --mem=28G

# go to folder and sync venv
cd /home2/nchw73/Tribes/
uv sync
source .venv/bin/activate

# verify we got gpu
echo "[slurm] Job running on node: $(hostname)"
echo "------------------------------------------------------"
python3 -c "import torch; print(f'[slurm] CUDA Available: {torch.cuda.is_available()}'); print(f'[slurm] Device: {torch.cuda.get_device_name(0)}')"
echo "------------------------------------------------------"


# Run the experiments
python3 script.py

echo "[slurm] Finished at $(date)"